import assert from 'node:assert/strict';
import {createSponsoredBetaConnection} from '../supabase/functions/_shared/beta-sponsored-provider.mjs';
const settings={ENABLE_SPONSORED_BETA:'true',BETA_ANTHROPIC_API_KEY:'synthetic-beta-secret',BETA_ANTHROPIC_MODEL:'explicit-claude-model',BETA_GEMINI_API_KEY:'synthetic-gemini-secret',BETA_GEMINI_MODEL:'explicit-gemini-model'};
const request={input:[{role:'user',content:[{type:'input_text',text:'Test meal'}]}],max_output_tokens:500};
let calls=0,reservations=0,allowed=true;
const admin={rpc:async(name,args)=>{assert.equal(name,'reserve_beta_sponsored_request');assert.equal(args.requested_user_id,'invited-user');reservations++;return {data:allowed,error:null};}};
const fetchImpl=async(url,options)=>{calls++;return Response.json(url.includes('anthropic')?{content:[{type:'text',text:'Synthetic analysis'}]}:{candidates:[{content:{parts:[{text:'Synthetic analysis'}]}}]});};
for(const provider of ['anthropic','gemini']){
 const connection=await createSponsoredBetaConnection({admin,userId:'invited-user',provider,env:n=>settings[n],fetchImpl});
 assert.equal(connection.billing,'beta_sponsor');
 assert.ok(!JSON.stringify(connection).includes('synthetic-'));
 const before=calls;await connection.call(request);assert.equal(calls,before+1);
 await assert.rejects(()=>connection.call({...request,tools:[{type:'web_search'}]}));
 await assert.rejects(()=>connection.call({...request,max_output_tokens:5000}));
 allowed=false;await assert.rejects(()=>connection.call(request),error=>error.status===429);assert.equal(calls,before+1);allowed=true;
}
for(const change of [{ENABLE_SPONSORED_BETA:'false'},{BETA_ANTHROPIC_API_KEY:''},{BETA_ANTHROPIC_MODEL:''}])await assert.rejects(()=>createSponsoredBetaConnection({admin,userId:'invited-user',provider:'anthropic',env:n=>({...settings,...change})[n],fetchImpl}));
assert.equal(calls,2);
console.log('Sponsored beta: explicit Claude/Gemini, hidden server keys, atomic allowance gate, token limits, no personal-key fallback passed.');
