import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import config from '../test-environment.json' with {type:'json'};
assert.equal(config.projectRef,'dkirmzthyynogkkaacmj');
const identities=JSON.parse(readFileSync(process.argv[2],'utf8'));assert(identities.every(account=>account.email.endsWith('@example.invalid')));
const tokens=[];
async function call(path,token,body,method='POST'){
 const response=await fetch(`${config.supabaseUrl}${path}`,{method,headers:{apikey:config.publishableKey,...(token?{authorization:`Bearer ${token}`}:{noauthorization:'synthetic'}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}return {status:response.status,data};
}
try{
 for(const account of identities){const login=await call('/auth/v1/token?grant_type=password',null,{email:account.email,password:account.password});assert.equal(login.status,200);tokens.push(login.data.access_token);}
 const [a,b]=tokens;
 let result=await call('/functions/v1/manage-referrals',a,{action:'status'});assert.equal(result.status,200);assert.equal(result.data.program.affiliateEnabled,false);assert.equal(result.data.program.subscriberEnabled,false);assert.equal(result.data.program.pointsPerReferral,null);
 result=await call('/functions/v1/manage-referrals',a,{action:'apply_affiliate'});assert.equal(result.status,200);
 result=await call('/functions/v1/manage-referrals',a,{action:'status'});assert.equal(result.data.affiliateStatus,'pending');
 result=await call('/functions/v1/manage-referrals',b,{action:'status',userId:identities[0].id});assert.equal(result.data.affiliateStatus,null,'A forged userId must not change whose account is read.');
 result=await call(`/rest/v1/affiliate_members?user_id=eq.${identities[0].id}`,b,undefined,'GET');assert.equal(result.status,200);assert.deepEqual(result.data,[]);
 for(const action of ['owner_status','owner_configure','owner_approve_affiliate']){result=await call('/functions/v1/manage-referrals',a,{action,userId:identities[1].id});assert.equal(result.status,403);}
 for(const channel of ['affiliate','subscriber']){result=await call('/functions/v1/manage-referrals',a,{action:'create_code',channel});assert.equal(result.status,403);}
 result=await call('/functions/v1/manage-referrals',a,{action:'attribute',code:'invalid-code'});assert.equal(result.status,400);
 result=await call('/functions/v1/manage-referrals',null,{action:'status'});assert.equal(result.status,401);
 console.log('PASS: live test Auth/referral API, disabled defaults, pending application, account isolation, owner/MFA denial, no unapproved codes, malformed input and anonymous denial.');
}finally{for(const token of tokens)await call('/auth/v1/logout?scope=global',token,{}).catch(()=>{});}
