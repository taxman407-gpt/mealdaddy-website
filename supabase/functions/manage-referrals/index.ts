import {createClient} from "npm:@supabase/supabase-js@2.54.0";
import {requireConditionalMfa} from "../_shared/conditional-mfa.ts";
import {requireOwnerAuthorization} from "../_shared/owner-authorization.ts";
import {lifetimeAccess} from "../_shared/membership-policy.mjs";
const headers={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, x-client-info, apikey, content-type","access-control-allow-methods":"POST, OPTIONS","content-type":"application/json"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
function namedKey(name:string,fallback:string){try{return JSON.parse(Deno.env.get(name)||"{}").default||Deno.env.get(fallback);}catch{return Deno.env.get(fallback);}}
Deno.serve(async(request)=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return json({error:'Authentication required.'},401);
 const url=Deno.env.get('SUPABASE_URL'),anon=namedKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return json({error:'Referrals are not configured.'},503);
 const auth=createClient(url,anon,{global:{headers:{Authorization:authorization}}});const {data:{user},error:authError}=await auth.auth.getUser();
 if(authError||!user)return json({error:'Authentication required.'},401);
 const admin=createClient(url,service);const mfa=await requireConditionalMfa(admin,user.id,authorization);if(!mfa.ok)return json({error:mfa.error},mfa.status);
 let input:Record<string,any>;try{input=await request.json();}catch{return json({error:'Invalid request.'},400);}
 const {data:settings,error:settingsError}=await admin.from('referral_program_settings').select('*').eq('id',true).maybeSingle();
 if(settingsError||!settings)return json({error:'Referral configuration is unavailable.'},503);
 const action=String(input.action||'status');
 if(action.startsWith('owner_')){
  const owner=await requireOwnerAuthorization(admin,user,authorization);if(!owner.ok)return json({error:owner.error},owner.status);
  if(action==='owner_configure'){
   const points=input.pointsPerReferral===null?null:Number(input.pointsPerReferral),cents=input.centsPerPoint===null?null:Number(input.centsPerPoint);
   if((points!==null&&(!Number.isSafeInteger(points)||points<1))||(cents!==null&&(!Number.isSafeInteger(cents)||cents<1)))return json({error:'Point values must be positive whole numbers or left unset.'},400);
   if(points!==settings.points_per_referral||cents!==settings.cents_per_point){
    const {data:existingRewards,error:rewardError}=await admin.from('referral_attributions').select('referred_user_id').eq('channel','subscriber').limit(1);
    if(rewardError)return json({error:'Existing reward terms could not be checked.'},503);
    if(existingRewards?.length)return json({error:'Already-promised point values cannot be changed through this settings screen.'},409);
   }
   const affiliate= input.affiliateEnabled===true,subscriber=input.subscriberEnabled===true;
   if(subscriber&&(points===null||cents===null))return json({error:'Choose and disclose the point award and conversion before enabling subscriber rewards.'},400);
   const {error}=await admin.from('referral_program_settings').update({affiliate_enabled:affiliate,subscriber_enabled:subscriber,points_per_referral:points,cents_per_point:cents,...(!settings.affiliate_enabled&&!settings.subscriber_enabled&&(affiliate||subscriber)?{started_at:new Date().toISOString()}:{})}).eq('id',true);
   return error?json({error:'Settings could not be saved.'},503):json({ok:true});
  }
  if(action==='owner_approve_affiliate'||action==='owner_reject_affiliate'){
   if(!/^[a-f0-9-]{36}$/i.test(String(input.userId||'')))return json({error:'A valid account ID is required.'},400);
   const {data:existing,error:existingError}=await admin.from('affiliate_members').select('status,approved_at').eq('user_id',input.userId).maybeSingle();
   if(existingError)return json({error:'Affiliate status could not be checked.'},503);
   if(existing?.status==='approved'&&action==='owner_reject_affiliate')return json({error:'An existing approved affiliate requires a separate agreement review before revocation.'},409);
   const {error}=await admin.from('affiliate_members').upsert({user_id:input.userId,status:action==='owner_approve_affiliate'?'approved':'rejected',approved_at:action==='owner_approve_affiliate'?(existing?.approved_at||new Date().toISOString()):null},{onConflict:'user_id'});
   return error?json({error:'Affiliate approval could not be saved.'},503):json({ok:true});
  }
  if(action==='owner_status'){
   const {data:applications,error}=await admin.from('affiliate_members').select('user_id,status,approved_at');
   if(error)return json({error:'Applications could not be read.'},503);
   return json({ok:true,settings,applications});
  }
  return json({error:'Unknown owner action.'},400);
 }
 if(action==='attribute'){
  if(!user.email_confirmed_at)return json({error:'Verify your email before linking a referral.'},403);
  if(!/^[a-f0-9-]{36}$/i.test(String(input.code||'')))return json({error:'Invalid referral code.'},400);
  const {data,error}=await admin.rpc('attribute_referral',{requested_user_id:user.id,requested_code:input.code,requested_joined_at:user.created_at});
  return error?json({error:'Referral could not be linked.'},503):json({ok:true,attributed:data===true});
 }
 if(action==='cancel_redemption'){
  if(!/^[a-f0-9-]{36}$/i.test(String(input.id||'')))return json({error:'Invalid reservation ID.'},400);
  const {data,error}=await admin.from('referral_redemptions').update({status:'released'}).eq('id',input.id).eq('user_id',user.id).eq('status','reserved').is('stripe_invoice_id',null).select('id').maybeSingle();
  return error||!data?json({error:'This discount is already processing or is unavailable.'},409):json({ok:true});
 }
 if(action==='apply_affiliate'){
  if(!user.email_confirmed_at)return json({error:'Verify your email first.'},403);
  const {error}=await admin.from('affiliate_members').upsert({user_id:user.id,status:'pending'},{onConflict:'user_id',ignoreDuplicates:true});
  return error?json({error:'Application could not be recorded.'},503):json({ok:true});
 }
 if(action==='create_code'||action==='reserve_redemption'){
  const [{data:subscription,error:subError},{data:license,error:licenseError},{data:affiliate,error:affiliateError}]=await Promise.all([
   admin.from('subscriptions').select('plan_key,status').eq('user_id',user.id).maybeSingle(),
   admin.from('lifetime_licenses').select('*').eq('user_id',user.id).maybeSingle(),
   admin.from('affiliate_members').select('status').eq('user_id',user.id).maybeSingle()
  ]);
  if(subError||licenseError||affiliateError)return json({error:'Membership could not be verified.'},503);
  const monthly=['core','byo'].includes(subscription?.plan_key)&&['active','trialing'].includes(subscription?.status),eligible=monthly||lifetimeAccess(license).active;
  if(action==='create_code'){
   const channel=input.channel==='affiliate'?'affiliate':input.channel==='subscriber'?'subscriber':null;
   if(!channel)return json({error:'Choose affiliate or subscriber referrals.'},400);
   if(channel==='affiliate'&&(!settings.affiliate_enabled||affiliate?.status!=='approved'))return json({error:'Affiliate referrals require owner approval and program activation.'},403);
   if(channel==='subscriber'&&(!settings.subscriber_enabled||!eligible))return json({error:'Subscriber referrals require an enabled program and current membership.'},403);
   const {error}=await admin.from('referral_codes').upsert({owner_id:user.id,channel},{onConflict:'owner_id,channel',ignoreDuplicates:true});
   if(error)return json({error:'Referral code could not be created.'},503);
   const {data:code,error:codeError}=await admin.from('referral_codes').select('code').eq('owner_id',user.id).eq('channel',channel).eq('active',true).maybeSingle();
   return codeError||!code?json({error:'Referral code is unavailable.'},503):json({ok:true,code:code.code});
  }
  if(!monthly)return json({error:'Points are redeemable only against a monthly subscription.'},409);
  const points=Number(input.points);if(!Number.isSafeInteger(points)||points<1)return json({error:'Choose a positive whole number of points.'},400);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
  const {data,error}=await admin.rpc('reserve_referral_redemption',{requested_user_id:user.id,requested_points:points,requested_month:`${parts.year}-${parts.month}-01`});
  if(error)return json({error:/MONTHLY_REFERRAL_CAP/.test(error.message)?'The $5 monthly redemption cap would be exceeded.':/INSUFFICIENT_REFERRAL_POINTS/.test(error.message)?'Not enough available referral points.':'Redemption is not available.'},409);
  return json({ok:true,reservationId:data,status:'reserved',message:'Points reserved for a subscription discount; no invoice discount has been applied yet.'});
 }
 if(action!=='status')return json({error:'Unknown action.'},400);
 const [{data:codes,error:codeError},{data:commissions,error:commissionError},{data:rewards,error:rewardError},{data:redemptions,error:redemptionError},{data:affiliate,error:affiliateError}]=await Promise.all([
  admin.from('referral_codes').select('code,channel,active').eq('owner_id',user.id),
  admin.from('affiliate_commissions').select('amount_cents,paid_out_cents').eq('referrer_user_id',user.id),
  admin.from('subscriber_referral_rewards').select('points,revoked').eq('referrer_user_id',user.id),
  admin.from('referral_redemptions').select('id,points,amount_cents,status,billing_month,stripe_invoice_id').eq('user_id',user.id),
  admin.from('affiliate_members').select('status').eq('user_id',user.id).maybeSingle()
 ]);
 if(codeError||commissionError||rewardError||redemptionError||affiliateError)return json({error:'Referral balances are unavailable.'},503);
 const earned=(rewards||[]).filter(row=>!row.revoked).reduce((sum,row)=>sum+Number(row.points),0),used=(redemptions||[]).filter(row=>row.status!=='released').reduce((sum,row)=>sum+Number(row.points),0);
 return json({ok:true,codes:codes||[],affiliateStatus:affiliate?.status||null,commissionCents:(commissions||[]).reduce((sum,row)=>sum+Number(row.amount_cents)-Number(row.paid_out_cents),0),pointsAvailable:Math.max(0,earned-used),redemptions:redemptions||[],program:{affiliateEnabled:settings.affiliate_enabled,subscriberEnabled:settings.subscriber_enabled,pointsPerReferral:settings.points_per_referral,centsPerPoint:settings.cents_per_point,monthlyCapCents:500}});
});
