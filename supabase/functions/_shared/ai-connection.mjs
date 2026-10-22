import {validateByok,callByokProvider} from './byok-provider.mjs';
import {openByokCredentials} from './byok-cloud-vault.mjs';
import {lifetimeAccess} from './membership-policy.mjs';
function failure(message,status=503){return Object.assign(new Error(message),{status});}
export async function resolveAiConnection({admin,userId,byokInput,hostedKey,env=name=>Deno.env.get(name),fetchImpl=fetch}){
 const [subscriptionResult,licenseResult,grantResult]=await Promise.all([
  admin.from('subscriptions').select('plan_key,status').eq('user_id',userId).maybeSingle(),
  admin.from('lifetime_licenses').select('*').eq('user_id',userId).maybeSingle(),
  admin.from('complimentary_access_grants').select('access_type,status').eq('user_id',userId).maybeSingle()
 ]);
 if(subscriptionResult.error||licenseResult.error||grantResult.error)throw failure('Membership access could not be verified.');
 const membership=subscriptionResult.data,license=lifetimeAccess(licenseResult.data);
 const current=membership&&['core','byo'].includes(membership.plan_key)&&['trialing','active'].includes(membership.status);
 const plan=current?membership.plan_key:license.active?license.plan:grantResult.data?.access_type==='family'&&grantResult.data?.status==='active'?'core':null;
 if(!plan)throw failure('An active MealDaddy membership is required.',402);
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
