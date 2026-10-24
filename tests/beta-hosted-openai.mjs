import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolveAiConnection as productionResolve} from '../supabase/functions/_shared/ai-connection.mjs';
const temp=await mkdtemp(join(tmpdir(),'beta-openai-'));
try{
 await cp('supabase/functions/_shared',temp,{recursive:true});
 await writeFile(join(temp,'beta-deployment.mjs'),'export const PRIVATE_BETA_DEPLOYMENT=true;');
 const {resolveAiConnection}=await import(pathToFileURL(join(temp,'ai-connection.mjs')));
 const input={storage:'beta_hosted',provider:'openai'};
 let calls=0;
 const makeAdmin=(plan='core',invited=true)=>({rpc:async name=>{assert.equal(name,'beta_access_for_user');return {data:invited?{plan:'byo'}:null};},from:table=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='subscriptions'?{plan_key:plan,status:'active'}:null})};return q;}});
 const base={admin:makeAdmin(),userId:'fixture',byokInput:input,hostedKey:'synthetic-key',env:()=>undefined,fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.authorization,'Bearer synthetic-key');return Response.json({output:[]});}};
 const ai=await resolveAiConnection(base);
 assert.equal(ai.provider,'openai');assert.equal(ai.byok,false);assert.equal(ai.plan,'core');assert.equal(ai.cost(450),450);assert.equal(ai.monthlyLimit(1200),1200);
 await ai.call({model:'existing-model',input:[]});assert.equal(calls,1);
 for(const patch of [{admin:makeAdmin('byo')},{admin:makeAdmin('core',false)},{byokInput:undefined},{hostedKey:null},{byokInput:{...input,key:'must-not-leak'}},{byokInput:{...input,provider:'anthropic'}}])await assert.rejects(()=>resolveAiConnection({...base,...patch}));
 await assert.rejects(()=>productionResolve(base));assert.equal(calls,1);
 console.log('Beta OpenAI: explicit opt-in, existing Core entitlement, invitation gate, retained cost limits, no production bypass, missing-key fail-closed passed.');
}finally{await rm(temp,{recursive:true,force:true});}
