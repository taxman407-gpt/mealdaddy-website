import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import config from '../test-environment.json' with {type:'json'};
assert.equal(config.projectRef,'dkirmzthyynogkkaacmj');
const identities=JSON.parse(readFileSync(process.argv[2],'utf8'));assert(identities.every(account=>account.email.endsWith('@example.invalid')));const tokens=[];
async function call(path,token,body,method='POST'){const response=await fetch(`${config.supabaseUrl}${path}`,{method,headers:{apikey:config.publishableKey,...(token?{authorization:`Bearer ${token}`}:{}) ,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data};}
try{
 for(const account of identities){const result=await call('/auth/v1/token?grant_type=password',null,{email:account.email,password:account.password});assert.equal(result.status,200,'Synthetic Auth login failed.');tokens.push(result.data.access_token);}
 const [a,b]=tokens;
 for(const token of [a,b]){
  let result=await call('/functions/v1/manage-byok',token,{action:'status',userId:identities[0].id});assert.equal(result.status,200);assert.equal(result.data.enabled,false);assert.equal(result.data.connection,null);
  result=await call('/functions/v1/manage-byok',token,{action:'save',credentials:{provider:'openai',model:'synthetic-model',key:'synthetic-not-a-real-key'}});assert.equal(result.status,503);
  result=await call('/functions/v1/manage-byok',token,{action:'remove',userId:identities[0].id});assert.equal(result.status,200);
  for(const action of ['view','export','welcome_status']){result=await call('/functions/v1/owner-conversion-report',token,{action});assert.equal(result.status,403);assert.equal(result.data.rows,undefined);}
  result=await call('/functions/v1/process-welcome-email',token,{});assert.equal(result.status,403);
  for(const table of ['byok_cloud_credentials','owner_registration_report','owner_report_audit','welcome_email_deliveries','welcome_email_settings','billing_payment_evidence']){result=await call(`/rest/v1/${table}?select=*`,token,undefined,'GET');assert.equal(result.status,403,`${table} allowed direct client reads.`);}
  result=await call('/rest/v1/rpc/claim_welcome_delivery',token,{});assert.equal(result.status,403);
 }
 for(const name of ['manage-byok','owner-conversion-report','process-welcome-email']){const result=await call(`/functions/v1/${name}`,null,{});assert.ok(name==='process-welcome-email'?[401,403].includes(result.status):result.status===401);}
 console.log('PASS: deployed test Auth/APIs, BYOK disabled defaults, metadata-only own status, owner/MFA denial for view/export/monitor, service-only welcome processing, all sensitive table/RPC client access denied, anonymous denial.');
}finally{for(const token of tokens)await call('/auth/v1/logout?scope=global',token,{}).catch(()=>{});}
