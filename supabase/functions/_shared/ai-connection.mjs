import {PRIVATE_BETA_DEPLOYMENT} from "./beta-deployment.mjs";
import {validateByok,callByokProvider} from './byok-provider.mjs';
import {openByokCredentials} from './byok-cloud-vault.mjs';
import {lifetimeAccess} from './membership-policy.mjs';
import {createSponsoredBetaConnection} from './beta-sponsored-provider.mjs';
function failure(message,status=503){return Object.assign(new Error(message),{status});}
export async function resolveAiConnection({admin,userId,byokInput,hostedKey,env=name=>Deno.env.get(name),fetchImpl=fetch}){
 const [subscriptionResult,licenseResult,grantResult]=await Promise.all([
  admin.from('subscriptions').select('plan_key,status').eq('user_id',userId).maybeSingle(),
  admin.from('lifetime_licenses').select('*').eq('user_id',userId).maybeSingle(),
  admin.from('complimentary_access_grants').select('access_type,plan_key,status').eq('user_id',userId).maybeSingle()
 ]);
 if(subscriptionResult.error||licenseResult.error||grantResult.error)throw failure('Membership access could not be verified.');
 const membership=subscriptionResult.data,license=lifetimeAccess(licenseResult.data);
 const current=membership&&['core','byo'].includes(membership.plan_key)&&['trialing','active'].includes(membership.status);
 let plan=current?membership.plan_key:license.active?license.plan:['family','beta'].includes(grantResult.data?.access_type)&&grantResult.data?.status==='active'?(grantResult.data.plan_key||'core'):null;
 const hostedEligible=plan==='core';
 if(PRIVATE_BETA_DEPLOYMENT){
  const access=await admin.rpc('beta_access_for_user',{target_user_id:userId});
  if(access.error||!access.data)throw failure('An active private beta invitation is required.',403);
  plan=access.data.plan;
  if(!byokInput)throw failure('Choose sponsor-paid AI or your personal API key explicitly. No hosted provider was used.',422);
 }
 if(byokInput?.storage==='beta_hosted'){
  if(!PRIVATE_BETA_DEPLOYMENT || !hostedEligible || byokInput.provider!=='openai' || byokInput.key || byokInput.model)throw failure('Existing Standard access is required for the beta OpenAI connection.',403);
  plan='core';byokInput=undefined;
 }
 if(!plan)throw failure('An active MealDaddy membership is required.',402);
 if(byokInput?.storage==='beta_sponsor'){
  if(byokInput.key || byokInput.model)throw failure('Sponsor-paid requests must not include a personal API key or model.',422);
  const sponsored=await createSponsoredBetaConnection({admin,userId,provider:byokInput.provider,env,fetchImpl});
  return {byok:true,billing:sponsored.billing,provider:sponsored.provider,membership,plan,
   modelFor:()=>sponsored.model,monthlyLimit:()=>1000000000000,cost:()=>0,
   assertCapabilities:({webSearch=false}={})=>{if(webSearch)throw failure('Web search is not supported by the sponsor-paid beta connection. No alternate provider was used.',422);},
   call:request=>sponsored.call(request)};
 }
 let credentials=null;
 if(plan==='byo'){
  if(env('ENABLE_BYOK')!=='true')throw failure('BYOK requests are not enabled. No hosted provider was used.');
  if(byokInput?.storage==='cloud'){
   if(env('ENABLE_BYOK_CLOUD')!=='true')throw failure('Account provider connections are not enabled.');
   const {data,error}=await admin.from('byok_cloud_credentials').select('version,provider,model,nonce,ciphertext').eq('user_id',userId).maybeSingle();
   if(error)throw failure('Account connection could not be read.');
   if(!data)throw failure('Connect your selected account provider key first.',422);
   try{credentials=await openByokCredentials(userId,data,env('BYOK_VAULT_MASTER_KEY'));}catch{throw failure('The encrypted account connection could not be opened. Reconnect it; no alternate provider was used.');}
  }else{try{credentials=validateByok(byokInput);}catch{throw failure('Connect your selected BYOK provider, model and key first.',422);}}
 }else{
  if(byokInput)throw failure('A BYOK connection requires an active BYOK membership.',402);
  if(!hostedKey)throw failure('Hosted AI is not configured.');
 }
 const byok=Boolean(credentials),provider=credentials?.provider||'openai';
 const assertCapabilities=({webSearch=false}={})=>{if(byok&&webSearch&&provider!=='openai')throw failure('Current web search is not supported for this selected provider connection. Choose an OpenAI connection explicitly or turn off optional web search; no alternate provider was used.',422);};
 return {byok,provider,membership,plan,modelFor:model=>credentials?.model||model,monthlyLimit:value=>byok?1000000000000:value,cost:value=>byok?0:value,assertCapabilities,
  async call(request){assertCapabilities({webSearch:Boolean(request.tools?.length)});if(byok)return callByokProvider(credentials,request,fetchImpl);return fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${hostedKey}`,'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(45000)});}
 };
}
