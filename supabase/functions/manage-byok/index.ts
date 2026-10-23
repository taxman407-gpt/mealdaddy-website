import {createClient} from "npm:@supabase/supabase-js@2.54.0";
import {requireConditionalMfa} from "../_shared/conditional-mfa.ts";
import {lifetimeAccess} from "../_shared/membership-policy.mjs";
import {sealByokCredentials} from "../_shared/byok-cloud-vault.mjs";
const headers={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, x-client-info, apikey, content-type","access-control-allow-methods":"POST, OPTIONS","content-type":"application/json"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
function namedKey(name:string,fallback:string){try{return JSON.parse(Deno.env.get(name)||"{}").default||Deno.env.get(fallback);}catch{return Deno.env.get(fallback);}}
Deno.serve(async(request)=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return json({error:'Authentication required.'},401);
 const url=Deno.env.get('SUPABASE_URL'),anon=namedKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return json({error:'Account key storage is unavailable.'},503);
 const auth=createClient(url,anon,{global:{headers:{Authorization:authorization}}});const {data:{user},error:authError}=await auth.auth.getUser();if(authError||!user)return json({error:'Authentication required.'},401);
 const admin=createClient(url,service),mfa=await requireConditionalMfa(admin,user.id,authorization);if(!mfa.ok)return json({error:mfa.error},mfa.status);
 let input:Record<string,any>;try{input=await request.json();}catch{return json({error:'Invalid request.'},400);}
 const action=input.action||'status';
 if(action==='remove'){
  const {error}=await admin.from('byok_cloud_credentials').delete().eq('user_id',user.id);
  return error?json({error:'The account connection could not be removed.'},503):json({ok:true});
 }
 const secret=Deno.env.get('BYOK_VAULT_MASTER_KEY');let encryptionReady=false;try{encryptionReady=atob(secret||'').length===32;}catch{}
 const enabled=Deno.env.get('ENABLE_BYOK')==='true'&&Deno.env.get('ENABLE_BYOK_CLOUD')==='true'&&encryptionReady;
 if(action==='status'){
  const {data,error}=await admin.from('byok_cloud_credentials').select('provider,model,updated_at').eq('user_id',user.id).maybeSingle();
  return error?json({error:'Account connection status is unavailable.'},503):json({ok:true,enabled,connection:data||null});
 }
 if(action!=='save')return json({error:'Unknown action.'},400);
 if(!enabled)return json({error:'Encrypted account key storage is not enabled and configured. Your key was not saved.'},503);
 const [{data:subscription,error:subError},{data:license,error:licenseError},{data:grant,error:grantError}]=await Promise.all([
  admin.from('subscriptions').select('plan_key,status').eq('user_id',user.id).maybeSingle(),
  admin.from('lifetime_licenses').select('*').eq('user_id',user.id).maybeSingle(),
  admin.from('complimentary_access_grants').select('access_type,plan_key,status').eq('user_id',user.id).maybeSingle()
 ]);
 if(subError||licenseError||grantError)return json({error:'BYOK membership could not be verified.'},503);
 const licenseAccess=lifetimeAccess(license);
 if(!(subscription?.plan_key==='byo'&&['active','trialing'].includes(subscription.status))&&!(licenseAccess.active&&licenseAccess.plan==='byo')&&!(grant?.status==='active'&&['family','beta'].includes(grant.access_type)&&grant.plan_key==='byo'))return json({error:'An active BYOK membership is required.'},402);
 try{
  const encrypted=await sealByokCredentials(user.id,input.credentials,secret);
  const {error}=await admin.from('byok_cloud_credentials').upsert({user_id:user.id,...encrypted,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)return json({error:'The encrypted connection could not be saved.'},503);
  return json({ok:true,provider:encrypted.provider,model:encrypted.model});
 }catch{return json({error:'Check the provider, model and key. The account connection was not changed.'},400);}
});
