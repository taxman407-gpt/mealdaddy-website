import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import {validateWelcomeTemplate} from '../supabase/functions/_shared/welcome-template.mjs';
const source=stripTypeScriptTypes(readFileSync('supabase/functions/manage-welcome-template/index.ts','utf8').replace(/^import .*;\n/gm,''),{mode:'strip'});
async function run({owner=true,auth=true,beta=true,conflict=false,body={action:'view'}}={}){
 let handler,writes=0,readChannel=null,args=null;
 const client={auth:{getUser:async()=>({data:{user:auth?{id:'fixture-owner'}:null},error:null})},from:()=>{const q={select:()=>q,eq:(k,v)=>{readChannel=v;return q},single:async()=>({data:{revision:1}})};return q},rpc:async(name,value)=>{writes++;args=value;return{data:conflict?null:{revision:2}}}};
 vm.runInNewContext(source,{Deno:{env:{get:n=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon'})[n]},serve:fn=>handler=fn},createClient:()=>client,requireOwnerAuthorization:async()=>owner?{ok:true}:{ok:false,status:403,error:'Owner multi-factor authentication is required.'},validateWelcomeTemplate,PRIVATE_BETA_DEPLOYMENT:beta,Response});
 const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer fixture',origin:'https://mealdaddy-october-test.taxman407.workers.dev'},body:JSON.stringify(body)}));return {status:response.status,writes,readChannel,args};
}
assert.equal((await run({owner:false})).status,403);assert.equal((await run({auth:false})).status,401);
assert.equal((await run()).readChannel,'beta');assert.equal((await run({beta:false})).readChannel,'live');
const body={action:'save_draft',revision:1,channel:'live',template:{subject:'Test',body:'Welcome {{signInUrl}}'}};
let r=await run({body});assert.equal(r.status,200);assert.equal(r.args.requested_channel,'beta');assert.equal(r.writes,1);
r=await run({body,conflict:true});assert.equal(r.status,409);
r=await run({body:{...body,template:{subject:'bad\nsubject',body:'{{signInUrl}}'}}});assert.equal(r.status,422);assert.equal(r.writes,0);
console.log('Welcome editor: auth, owner/MFA denial, beta isolation, validation and stale-save conflict passed.');
