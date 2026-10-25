import {createClient} from "npm:@supabase/supabase-js@2.54.0";
import {welcomePayload,welcomeRetry,sendWelcome} from "../_shared/welcome-email.mjs";
Deno.serve(async request=>{
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!service||request.headers.get('authorization')!==`Bearer ${service}`)return json({error:'Service authorization required.'},403);
 if(Deno.env.get('ENABLE_WELCOME_EMAIL')!=='true')return json({ok:true,enabled:false});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('WELCOME_FROM'),signInUrl=Deno.env.get('WELCOME_SIGN_IN_URL');
 if(!url||!key||!from||!signInUrl||Deno.env.get('WELCOME_SENDER_VERIFIED')!=='true')return json({error:'Verified email delivery is not configured.'},503);
 const admin=createClient(url,service),{data:delivery,error}=await admin.rpc('claim_welcome_delivery');if(error)return json({error:'Outbox claim failed.'},503);if(!delivery)return json({ok:true,processed:0});
 const save=(patch:Record<string,unknown>)=>admin.from('welcome_email_deliveries').update({...patch,updated_at:new Date().toISOString()}).eq('user_id',delivery.user_id).eq('lease_token',delivery.lease_token).eq('status','sending').select('user_id').maybeSingle();
 try{
  // The isolated project accepts only the provider's documented test sink, never real recipients.
  if(url.includes('dkirmzthyynogkkaacmj')&&delivery.recipient!=='delivered@resend.dev')throw Object.assign(new Error('TEST_RECIPIENT_BLOCKED'),{permanent:true,code:'TEST_RECIPIENT_BLOCKED'});
  let payload=delivery.payload;
  if(!payload){payload=welcomePayload({recipient:delivery.recipient,from,signInUrl,...(delivery.template_snapshot?{template:delivery.template_snapshot}:{})});const saved=await save({payload});if(saved.error||!saved.data)throw new Error('WELCOME_PAYLOAD_NOT_SAVED');}
  const {data:account,error:accountError}=await admin.auth.admin.getUserById(delivery.user_id);
  if(accountError||!account?.user?.email_confirmed_at||account.user.email!==delivery.recipient)throw Object.assign(new Error('ACCOUNT_UNAVAILABLE'),{permanent:true,code:'ACCOUNT_UNAVAILABLE'});
  const result=await sendWelcome({delivery:{...delivery,payload},key});
  const saved=await save({status:'sent',sent_at:new Date().toISOString(),provider_message_id:result.messageId,lease_until:null,last_error_code:null});
  if(saved.error||!saved.data)return json({error:'Delivery accepted; outbox reconciliation required. Retry uses the same idempotency key.'},503);
  return json({ok:true,processed:1});
 }catch(error){
  const retry=welcomeRetry({attempts:delivery.attempts,firstAttemptAt:delivery.first_attempt_at,permanent:error.permanent===true});
  const saved=await save({status:retry.status,...(retry.nextAttemptAt?{next_attempt_at:retry.nextAttemptAt}:{}),lease_until:null,last_error_code:error.code||'DELIVERY_UNCERTAIN'});
  return json({ok:false,status:retry.status,...(saved.error?{error:'Outbox reconciliation required.'}:{})},503);
 }
});
