import assert from 'node:assert/strict';
import {resolveAiConnection} from '../supabase/functions/_shared/ai-connection.mjs';
import {sealByokCredentials} from '../supabase/functions/_shared/byok-cloud-vault.mjs';
const userId='fixture-user',secret=btoa('x'.repeat(32));
async function access({plan='byo',status='active',grant=null,license=null,byokInput={provider:'anthropic',model:'explicit-model',key:'synthetic-provider-key'},cloud=null,enabled=true,cloudEnabled=true,master=secret,hostedKey=null,lookupError=false,sponsorEnabled=false,sponsorAllowed=true}={}){const calls=[];const admin={rpc:async(name,args)=>{assert.equal(name,"reserve_beta_sponsored_request");assert.equal(args.requested_user_id,userId);return {data:sponsorAllowed,error:null};},from:table=>{const q={select:()=>q,eq:(key,value)=>{assert.equal(value,userId);return q;},maybeSingle:async()=>({data:table==='subscriptions'?{plan_key:plan,status}:table==='lifetime_licenses'?license:table==='complimentary_access_grants'?grant:cloud,error:lookupError?{}:null})};return q;}};const ai=await resolveAiConnection({admin,userId,byokInput,hostedKey,env:name=>({ENABLE_BYOK:String(enabled),ENABLE_BYOK_CLOUD:String(cloudEnabled),BYOK_VAULT_MASTER_KEY:master,ENABLE_SPONSORED_BETA:String(sponsorEnabled),BETA_ANTHROPIC_API_KEY:"synthetic-sponsored-key",BETA_ANTHROPIC_MODEL:"explicit-sponsored-model"})[name],fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(url.includes('anthropic')?{content:[{type:'text',text:'Synthetic guidance'}]}:{output:[{content:[{type:'output_text',text:'Synthetic guidance'}]}]});}});return {ai,calls};}
let {ai,calls}=await access();assert.equal(ai.byok,true);assert.equal(ai.cost(50000),0);assert.equal(ai.modelFor('hosted-model'),'explicit-model');assert.throws(()=>ai.assertCapabilities({webSearch:true}),error=>error.status===422);assert.equal(calls.length,0);await ai.call({input:[{role:'user',content:[{type:'input_text',text:'Dinner'}]}],max_output_tokens:700});assert.equal(calls.length,1);assert.ok(calls[0].url.includes('anthropic'));assert.equal(JSON.parse(calls[0].options.body).max_tokens,700);assert.equal(JSON.parse(calls[0].options.body).output_config,undefined);
for(const options of [{status:'past_due'},{status:'canceled'},{byokInput:null},{enabled:false},{plan:'core',byokInput:null},{plan:'core',hostedKey:'hosted-key'},{lookupError:true}])await assert.rejects(()=>access(options));
({ai,calls}=await access({plan:'core',byokInput:null,hostedKey:'synthetic-hosted'}));assert.equal(ai.byok,false);assert.equal(ai.cost(123),123);ai.assertCapabilities({webSearch:true});await ai.call({model:'hosted-model',input:[]});assert.equal(calls[0].options.headers.authorization,'Bearer synthetic-hosted');
({ai}=await access({plan:'core',status:'canceled',byokInput:null,hostedKey:'synthetic-hosted',license:{plan_key:'core',status:'paid',purchased_at:'2026-01-01',maintenance_paid_through:'2099-01-01'}}));assert.equal(ai.plan,'core');
const cloud=await sealByokCredentials(userId,{provider:'openai',model:'explicit-cloud-model',key:'synthetic-cloud-key'},secret);
({ai}=await access({byokInput:{storage:'cloud'},cloud}));assert.equal(ai.provider,'openai');assert.equal(ai.modelFor('hosted'),'explicit-cloud-model');ai.assertCapabilities({webSearch:true});
for(const options of [{cloud:null},{cloudEnabled:false},{master:btoa('z'.repeat(32))}])await assert.rejects(()=>access({byokInput:{storage:'cloud'},cloud,...options}));
console.log('Shared AI connection: active monthly/lifetime membership, fail-closed lookups, explicit device/cloud provider, no hosted fallback/cost and unsupported search rejection passed.');
// Complimentary beta access must exercise BYOK without a paid subscription.
({ai,calls}=await access({plan:null,grant:{access_type:'beta',plan_key:'byo',status:'active'}}));
assert.equal(ai.plan,'byo');assert.equal(ai.byok,true);assert.equal(calls.length,0);
await assert.rejects(()=>access({plan:null,grant:{access_type:'beta',plan_key:'byo',status:'active'},byokInput:null}));
await assert.rejects(()=>access({plan:null,grant:{access_type:'beta',plan_key:'byo',status:'revoked'}}));

// Sponsor access stays explicit and is checked again at every provider request.
const sponsorOptions={plan:null,grant:{access_type:'beta',plan_key:'core',status:'active'},byokInput:{storage:'beta_sponsor',provider:'anthropic'},sponsorEnabled:true};
({ai,calls}=await access(sponsorOptions));
assert.equal(ai.billing,'beta_sponsor');assert.equal(ai.cost(100),0);assert.equal(ai.modelFor('hosted'),'explicit-sponsored-model');
assert.throws(()=>ai.assertCapabilities({webSearch:true}));
await ai.call({input:[{role:'user',content:[{type:'input_text',text:'Dinner'}]}],max_output_tokens:700});
assert.equal(calls.length,1);assert.ok(calls[0].url.includes('anthropic'));
assert.equal(calls[0].options.headers['x-api-key'],'synthetic-sponsored-key');
await assert.rejects(()=>access({...sponsorOptions,sponsorEnabled:false}));
await assert.rejects(()=>access({...sponsorOptions,grant:null}));
await assert.rejects(()=>access({...sponsorOptions,byokInput:{...sponsorOptions.byokInput,key:'personal-secret'}}));
({ai,calls}=await access({...sponsorOptions,sponsorAllowed:false}));
await assert.rejects(()=>ai.call({input:[],max_output_tokens:700}),e=>e.status===429);
assert.equal(calls.length,0);
console.log('Shared sponsor routing: complimentary Standard, explicit funding choice, no personal-key fallback, revoked allowance and disabled sponsor rejected.');
