import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { requireConditionalMfa } from "../_shared/conditional-mfa.ts";
import { membershipPlans, assertPlanPrice, maintenanceQuote, lifetimePurchasePlan, addUtcYears } from "../_shared/membership-policy.mjs";
const headers={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, x-client-info, apikey, content-type","access-control-allow-methods":"POST, OPTIONS","content-type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
function namedKey(name:string,fallback:string){try{return JSON.parse(Deno.env.get(name)||"{}").default||Deno.env.get(fallback);}catch{return Deno.env.get(fallback);}}
Deno.serve(async(request)=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 if(Deno.env.get('ENABLE_LIFETIME_BILLING')!=='true')return json({error:'Lifetime billing is not enabled in this environment.'},503);
 const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return json({error:'Authentication required.'},401);
 const url=Deno.env.get('SUPABASE_URL'),anon=namedKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),stripeKey=Deno.env.get('STRIPE_SECRET_KEY'),origin=Deno.env.get('APP_ORIGIN');
 if(!url||!anon||!service||!stripeKey||!origin)return json({error:'Lifetime billing is not configured.'},503);
 if(url.includes('dkirmzthyynogkkaacmj')&&(!/^(sk|rk)_test_/.test(stripeKey)||origin!=='https://mealdaddy-october-test.taxman407.workers.dev'))return json({error:'Isolated billing requires sandbox credentials and the test site origin.'},503);
 let parsedOrigin:URL;try{parsedOrigin=new URL(origin);if(parsedOrigin.protocol!=='https:'||parsedOrigin.origin!==origin)throw new Error();}catch{return json({error:'Billing origin is invalid.'},503);}
 const auth=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
 const {data:{user},error:authError}=await auth.auth.getUser();if(authError||!user)return json({error:'Authentication required.'},401);
 const admin=createClient(url,service);const mfa=await requireConditionalMfa(admin,user.id,authorization);if(!mfa.ok)return json({error:mfa.error},mfa.status);
 let input:{plan?:string;kind?:string};try{input=await request.json();}catch{return json({error:'Invalid request.'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'Invalid request.'},400);
 const kind=input.kind==='maintenance'?'maintenance':'purchase';
 const planKey=input.plan==='core_lifetime'?'core':input.plan==='byo_lifetime'?'byo':null;
 if(!planKey)return json({error:'Unknown lifetime plan.'},400);
 if(planKey==='byo'&&Deno.env.get('ENABLE_BYOK')!=='true')return json({error:'BYOK is not enabled.'},503);
 const [{data:license,error:licenseError},{data:subscription,error:subscriptionError},{data:grant,error:grantError}]=await Promise.all([
  admin.from('lifetime_licenses').select('*').eq('user_id',user.id).maybeSingle(),
  admin.from('subscriptions').select('status').eq('user_id',user.id).maybeSingle(),
  admin.from('complimentary_access_grants').select('status').eq('user_id',user.id).maybeSingle()
 ]);
 if(licenseError||subscriptionError||grantError)return json({error:'Membership could not be checked.'},503);
 if(kind==='purchase'&&(license||grant?.status==='active'||['active','trialing','incomplete','past_due','unpaid','paused'].includes(subscription?.status)))return json({error:'Current membership already exists. Resolve it before purchasing a lifetime license.'},409);
 if(kind==='maintenance'&&(!license||license.status!=='paid'||license.plan_key!==planKey))return json({error:'A matching valid lifetime license is required.'},409);
 if(kind==='maintenance'&&Date.now()<Date.parse(addUtcYears(license.purchased_at,3)))return json({error:'Your first three years of maintenance are included. Renewal checkout opens after that included period ends.'},409);
 const stripe=new Stripe(stripeKey,{apiVersion:'2026-08-26.dahlia'});
 let priceId:string|undefined,expectedAmount:number,purchasePlan:any;
 if(kind==='purchase'){
  const {data:availability,error}=await admin.rpc('founding_license_availability');
  if(error)return json({error:'License availability could not be checked.'},503);
  try{purchasePlan=lifetimePurchasePlan(`${planKey}_lifetime`,availability);}catch{return json({error:'This lifetime offer is unavailable.'},409);}
  priceId=Deno.env.get(purchasePlan.priceVariable);expectedAmount=purchasePlan.amountCents;
 }
 else {
  const {data:notices,error}=await admin.from('lifetime_maintenance_notices').select('plan_key,amount_cents,notified_at,effective_at').eq('user_id',user.id);
  if(error)return json({error:'Maintenance notice history is unavailable.'},503);
  try{expectedAmount=maintenanceQuote(license,{changes:(notices||[]).map(row=>({plan:row.plan_key,amountCents:row.amount_cents,notifiedAt:row.notified_at,effectiveAt:row.effective_at}))}).amountCents;}catch{return json({error:'Maintenance pricing requires review.'},503);}
  priceId=Deno.env.get(planKey==='core'?'STRIPE_CORE_MAINTENANCE_PRICE_ID':'STRIPE_BYO_MAINTENANCE_PRICE_ID');
 }
 if(!priceId)return json({error:'This billing price is not configured.'},503);
 try{
  const price=await stripe.prices.retrieve(priceId);
  if(kind==='purchase')assertPlanPrice(`${planKey}_lifetime`,price,purchasePlan);
  else if(!price.active||price.currency!=='usd'||price.type!=='one_time'||price.unit_amount!==expectedAmount)throw new Error('Incorrect maintenance price');
  const {data:prior,error:priorError}=await admin.from('stripe_checkout_sessions').select('checkout_session_id').eq('user_id',user.id).in('status',['open','complete']);
  if(priorError)return json({error:'Existing checkout could not be checked.'},503);
  for(const record of prior||[]){
   const session=await stripe.checkout.sessions.retrieve(record.checkout_session_id);
   if(session.mode!=='payment'||session.metadata?.billing_purpose!=='lifetime_license'||session.metadata?.license_kind!==kind)continue;
   if(session.status==='open'&&session.url){
    if(session.metadata?.plan_key!==planKey)return json({error:'An open checkout already exists for another lifetime plan. Complete or cancel it before switching plans.'},409);
    const {data:savedQuote,error:quoteReadError}=await admin.from('lifetime_checkout_quotes').select('checkout_session_id').eq('checkout_session_id',session.id).eq('user_id',user.id).maybeSingle();
    if(quoteReadError)return json({error:'The existing quote could not be checked.'},503);
    if(savedQuote)return json({url:session.url});
    await stripe.checkout.sessions.expire(session.id);
    await admin.from('stripe_checkout_sessions').update({status:'expired'}).eq('checkout_session_id',session.id).eq('user_id',user.id);
   }
   if(session.status==='complete'){const {data:applied,error:appliedError}=await admin.from('lifetime_payments').select('checkout_session_id').eq('checkout_session_id',session.id).eq('user_id',user.id).maybeSingle();if(appliedError||!applied)return json({error:'A previous payment is awaiting reconciliation. No second checkout was created.'},409);}
  }
  const session=await stripe.checkout.sessions.create({integration_identifier:'mealdaddy_lifetime_hkqzpmte',mode:'payment',customer_email:user.email,client_reference_id:user.id,line_items:[{price:priceId,quantity:1}],success_url:`${origin}/app/app.html?checkout=success`,cancel_url:`${origin}/app/app.html?checkout=cancelled`,allow_promotion_codes:kind==='purchase',metadata:{user_id:user.id,plan_key:planKey,billing_purpose:'lifetime_license',license_kind:kind,policy_version:'october2026_v1'}},{idempotencyKey:`license-${user.id}-${planKey}-${kind}-${new Date().toISOString().slice(0,10)}`});
  const {error:tracking}=await admin.from('stripe_checkout_sessions').upsert({checkout_session_id:session.id,user_id:user.id,status:session.status||'open',updated_at:new Date().toISOString()},{onConflict:'checkout_session_id'});
  if(tracking){if(session.status==='open')await stripe.checkout.sessions.expire(session.id);return json({error:'Checkout ownership could not be recorded.'},503);}
  const {error:quoteError}=await admin.from('lifetime_checkout_quotes').upsert({checkout_session_id:session.id,user_id:user.id,plan_key:planKey,kind,price_id:priceId,amount_cents:expectedAmount},{onConflict:'checkout_session_id'});
  if(quoteError){if(session.status==='open')await stripe.checkout.sessions.expire(session.id);return json({error:'The checkout price could not be recorded. No access was granted.'},503);}
  return json({url:session.url,amountCents:expectedAmount,backFeesCents:0});
 }catch{return json({error:'Lifetime checkout could not be prepared. No access was granted.'},502);}
});
