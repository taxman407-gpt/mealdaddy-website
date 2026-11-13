import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {parsePantryRequest, pantryInterpretationFormat, validatePantryInterpretation} from '../supabase/functions/_shared/pantry-review-contract.mjs';
const userId='00000000-0000-4000-8000-000000000001';
const path=n=>`${userId}/pantry-scan-00000000-0000-4000-8000-${String(n).padStart(12,'0')}.jpg`;
const source=stripTypeScriptTypes(readFileSync('supabase/functions/pantry-review/index.ts','utf8').replace(/^import .*;\n/gm,''),{mode:'strip'});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function exercise(options={}) {
 let handler;const calls=[],downloads=[],removals=[],events=[],tables=[];
 const body=options.body || {action:'interpret',photoPaths:[path(2),path(3)],description:'The tub is plain yogurt.'};
 const client={auth:{getUser:async()=>({data:{user:options.auth===false?null:{id:userId}},error:null})},
  from(table){tables.push(table);return{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{diet_style:'Mediterranean',onboarding_data:{foods_to_avoid:'Peanuts',medical_restrictions:'Saved test restriction'}},error:options.profileError?{message:'private error'}:null})};},
  rpc:async(name,args)=>{events.push({name,args});if(name==='reserve_ai_usage')return{data:options.quotaFail?null:[{reservation_id:'synthetic-reservation'}],error:null};return{data:true,error:options.settleFail&&name==='settle_ai_usage'?{message:'accounting issue'}:null};},
  storage:{from:()=>({download:async p=>{downloads.push(p);return{data:options.badType?new Blob(['x'],{type:'text/html'}):new Blob(['synthetic jpeg'],{type:'image/jpeg'}),error:options.downloadFail?{message:'not found'}:null};},remove:async paths=>{removals.push([...paths]);if(options.cleanupFail)throw Error('offline');return{error:null};}})}};
 const env=name=>name==='SUPABASE_URL'?'https://synthetic.invalid':name==='SUPABASE_PUBLISHABLE_KEYS'||name==='SUPABASE_SECRET_KEYS'?'{}':'synthetic-secret';
 const mockAi={membership:{status:'active'},provider:'synthetic',byok:true,modelFor:()=> 'selected-test-model',monthlyLimit:n=>n,cost:()=>0};
 const output=options.output===undefined?{items:[{name:'Plain yogurt',quantity:'',confidence:'high',note:'Available amount unknown.',photo_numbers:[1,2]}]}:options.output;
 const text=body.action==='plan'?(options.planText || 'A recipe using confirmed tofu and herbs.'):typeof output==='string'?output:JSON.stringify(output);
 vm.runInNewContext(source,{createClient:()=>client,PRIVATE_BETA_DEPLOYMENT:options.beta!==false,
  requireConditionalMfa:async()=>({ok:!options.mfaFail,status:403,error:'MFA required'}),
  requireAdultEligibility:async()=>({ok:!options.ageFail,status:403,error:'Confirm adult eligibility'}),
  resolveAiConnection:async()=>{if(options.connectionFail)throw Object.assign(Error('Choose a connection'),{status:422});return mockAi;},
  trackedAiCall:async args=>{calls.push(args);if(options.providerThrow)throw Error('unavailable');return Response.json({output:[{content:[{type:'output_text',text}]}],usage:{input_tokens:20,output_tokens:40}},{status:options.providerFail?502:200});},
  parsePantryRequest,pantryInterpretationFormat,validatePantryInterpretation,
  Deno:{env:{get:env},serve:fn=>handler=fn},crypto:webcrypto,Request,Response,Blob,TextEncoder,Uint8Array,btoa,console:{warn:()=>{}}});
 const response=await handler(new Request('https://fixture.invalid/pantry-review',{method:options.method || 'POST',headers:options.noHeader?{}:{authorization:'Bearer synthetic'},body:options.method==='GET'?undefined:JSON.stringify(body)}));
 return{status:response.status,payload:await response.json(),calls,downloads,removals,events,tables};
}
let r=await exercise();eq(r.status,200);eq(r.payload.requiresConfirmation,true);eq(r.payload.items[0].quantity,'');eq(r.calls.length,1);eq(r.downloads.length,2);eq(r.removals[0],[path(2),path(3)]);
eq(r.calls[0].request.input[1].content.filter(x=>x.type==='input_image').length,2);eq(r.tables.length,0);eq(r.events.map(e=>e.name),['reserve_ai_usage','settle_ai_usage']);
for(const options of [{beta:false},{auth:false},{noHeader:true},{mfaFail:true},{ageFail:true},{connectionFail:true},{body:{action:'interpret',photoPaths:[path(2).replace(userId,'another-account')]}},{body:{action:'plan',confirmed:false,items:[{name:'Tofu',quantity:'8 oz'}]}}]) {
 r=await exercise(options);assert.ok(r.status>=400);checks++;eq(r.calls.length,0);eq(r.downloads.length,0);eq(r.removals.length,0);
}
for(const options of [{badType:true},{downloadFail:true},{quotaFail:true}]){r=await exercise(options);assert.ok(r.status>=400);checks++;eq(r.calls.length,0);eq(r.removals[0],[path(2),path(3)]);}
for(const options of [{providerFail:true},{providerThrow:true}]){r=await exercise(options);assert.ok(r.status>=400);checks++;eq(r.events.at(-1).name,'release_ai_usage');eq(r.removals[0],[path(2),path(3)]);}
r=await exercise({output:'not json'});eq(r.status,502);eq(r.events.at(-1).name,'settle_ai_usage');
r=await exercise({output:{items:[{name:'Yogurt',quantity:'1 cup',confidence:'high',note:'',photo_numbers:[7]}]}});eq(r.status,422);
r=await exercise({cleanupFail:true});eq(r.status,200);
r=await exercise({settleFail:true});eq(r.status,503);eq(r.events.at(-1).name,'settle_ai_usage');
const confirmed={action:'plan',confirmed:true,items:[{name:'Tofu',quantity:'8 oz'},{name:'Lemon',quantity:''}],preferences:'Use herbs'};
r=await exercise({body:confirmed});eq(r.status,200);eq(r.downloads.length,0);eq(r.removals.length,0);eq(r.calls[0].request.input[1].content.length,1);
const sent=JSON.parse(r.calls[0].request.input[1].content[0].text);eq(sent.confirmedFoods,confirmed.items);eq(sent.savedRequirements.foods_to_avoid,'Peanuts');eq(sent.confirmedFoods[1].quantity,'');
r=await exercise({body:confirmed,profileError:true});eq(r.status,503);eq(r.calls.length,0);
r=await exercise({body:{...confirmed,photoPaths:[path(2)]}});eq(r.status,422);eq(r.calls.length,0);
console.log(`PASS: ${checks} Priority 1 endpoint checks (auth/MFA/adult/beta guards, ownership, quotas, review-only images, confirmed-only planning, cleanup and accounting). No live provider requests.`);
