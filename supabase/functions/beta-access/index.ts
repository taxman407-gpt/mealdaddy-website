import {createClient} from 'npm:@supabase/supabase-js@2.54.0';
import {requireOwnerAuthorization} from '../_shared/owner-authorization.ts';
import {requireConditionalMfa} from '../_shared/conditional-mfa.ts';
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,x-client-info,content-type','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 const authorization=request.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return json({error:'Sign in to continue.'},401);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return json({error:'Beta access is not configured.'},503);
 const admin=createClient(url,key),{data:{user},error}=await admin.auth.getUser(authorization.slice(7));
 if(error||!user)return json({error:'Sign in to continue.'},401);
 let body;try{body=await request.json();}catch{return json({error:'Invalid request.'},400);}
 const action=body.action||'status';
 if(['status','accept'].includes(action)){
  const mfa=await requireConditionalMfa(admin,user.id,authorization);if(!mfa.ok)return json({error:mfa.error},mfa.status);
  const result=await admin.rpc(action==='accept'?'accept_beta_invitation':'beta_access_for_user',action==='accept'?{requested_user_id:user.id}:{target_user_id:user.id});
  if(result.error)return json({error:'Your beta invitation could not be checked.'},503);
  if(!result.data)return json({error:'This account is not invited to the private beta. Ask Steve to approve this login email.'},403);
  const configured=(provider:string)=>Boolean(Deno.env.get(provider==='anthropic'?'BETA_ANTHROPIC_API_KEY':'BETA_GEMINI_API_KEY')&&Deno.env.get(provider==='anthropic'?'BETA_ANTHROPIC_MODEL':'BETA_GEMINI_MODEL'));
  return json({ok:true,...result.data,providers:{anthropic:configured('anthropic'),gemini:configured('gemini')}});
 }
 const owner=await requireOwnerAuthorization(admin,user,authorization);if(!owner.ok)return json({error:owner.error},owner.status);
 let result;
 if(action==='list')result=await admin.rpc('beta_owner_dashboard');
 else if(action==='invite'||action==='revoke'){
  if(typeof body.email!=='string'||!['core','byo'].includes(body.plan))return json({error:'Enter an email and choose Standard or BYOK.'},422);
  result=await admin.rpc('manage_beta_invitation',{requested_actor:user.id,requested_email:body.email,requested_plan:body.plan,requested_active:action==='invite'});
 }else if(action==='limits'){
  if(typeof body.enabled!=='boolean'||![body.userLimit,body.dailyLimit,body.totalLimit].every(Number.isSafeInteger)||body.userLimit<1||body.userLimit>1000||body.dailyLimit<1||body.dailyLimit>10000||body.totalLimit<1||body.totalLimit>100000)return json({error:'Enter valid whole-number usage limits.'},422);
  if(body.enabled && (!Deno.env.get('BETA_ANTHROPIC_API_KEY')||!Deno.env.get('BETA_ANTHROPIC_MODEL')) && (!Deno.env.get('BETA_GEMINI_API_KEY')||!Deno.env.get('BETA_GEMINI_MODEL')))return json({error:'Configure a sponsor provider key and model before enabling usage.'},422);
  result=await admin.rpc('set_beta_sponsor_limits',{requested_actor:user.id,requested_enabled:body.enabled,requested_user_limit:body.userLimit,requested_daily_limit:body.dailyLimit,requested_total_limit:body.totalLimit});
 }else return json({error:'Unknown beta action.'},400);
 if(result.error)return json({error:'Beta settings could not be updated. Check the submitted values and retry.'},503);
 return json({ok:true,data:result.data});
});
