import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {lifetimeAccess} from '../supabase/functions/_shared/membership-policy.mjs';
import {sealByokCredentials,openByokCredentials} from '../supabase/functions/_shared/byok-cloud-vault.mjs';
const source=stripTypeScriptTypes(readFileSync('supabase/functions/manage-byok/index.ts','utf8').replace(/^import .*;\n/gm,''),{mode:'strip'});
const secret=btoa('x'.repeat(32));
async function run({action='status',enabled=true,member=true,mfa=true,authenticated=true,credentials={provider:'openai',model:'fixture-model',key:'fixture-secret-key'},forgedUser='other-user',privateBeta=false,betaPlan=null}={}){
 let handler,stored,deleted=false;const filters=[];
 const client={rpc:async()=>({data:betaPlan?{plan:betaPlan}:null,error:null}),auth:{getUser:async()=>({data:{user:authenticated?{id:'actual-user'}:null},error:null})},from(table){const q={select(){return q;},eq(key,value){filters.push([table,key,value]);return q;},delete(){deleted=true;return q;},async upsert(value){stored=value;return {error:null};},async maybeSingle(){return {data:table==='subscriptions'?(member?{plan_key:'byo',status:'active'}:null):table==='byok_cloud_credentials'?{provider:'openai',model:'fixture-model',updated_at:'now'}:null,error:null};},then(resolve){return Promise.resolve({error:null}).then(resolve);}};return q;}};
 vm.runInNewContext(source,{PRIVATE_BETA_DEPLOYMENT:privateBeta,createClient:()=>client,lifetimeAccess,sealByokCredentials,requireConditionalMfa:async()=>mfa?{ok:true}:{ok:false,status:403,error:'MFA required'},Deno:{env:{get:name=>name==='SUPABASE_PUBLISHABLE_KEYS'?'{}':name==='BYOK_VAULT_MASTER_KEY'?secret:name.startsWith('ENABLE_')?String(enabled):'fixture'},serve:fn=>handler=fn},Response,atob});
 const response=await handler(new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({action,credentials,userId:forgedUser})}));
 return {status:response.status,payload:await response.json(),stored,deleted,filters};
}
let r=await run({action:'save'});assert.equal(r.status,200);assert.equal(r.stored.user_id,'actual-user');assert.ok(!JSON.stringify(r.stored).includes('fixture-secret-key'));assert.equal((await openByokCredentials('actual-user',r.stored,secret)).key,'fixture-secret-key');
r=await run();assert.equal(r.status,200);assert.ok(!JSON.stringify(r.payload).includes('ciphertext'));assert.ok(r.filters.every(([,key,value])=>key!=='user_id'||value==='actual-user'));
for(const [options,status] of [[{action:'save',enabled:false},503],[{action:'save',member:false},402],[{action:'save',mfa:false},403],[{action:'save',authenticated:false},401],[{action:'save',credentials:{}},400]]){r=await run(options);assert.equal(r.status,status);assert.equal(r.stored,undefined);}
r=await run({action:'remove',enabled:false,member:false});assert.equal(r.status,200);assert.equal(r.deleted,true);assert.deepEqual(r.filters,[['byok_cloud_credentials','user_id','actual-user']]);
console.log('Account BYOK API: auth/MFA, membership and feature gates, encrypted own-account writes, metadata-only status, removal while disabled passed.');

r=await run({action:'save',member:false,privateBeta:true,betaPlan:'byo'});assert.equal(r.status,200);
r=await run({action:'save',member:false,privateBeta:true,betaPlan:'core'});assert.equal(r.status,402);assert.equal(r.stored,undefined);
r=await run({action:'save',member:true,privateBeta:true});assert.equal(r.status,403);assert.equal(r.stored,undefined);
console.log('Beta account vault: invitation BYOK choice respected without changing existing paid/family access; Standard/uninvited denied.');
