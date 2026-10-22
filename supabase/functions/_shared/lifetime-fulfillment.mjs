/** Only a verified webhook + an owned durable quote can grant a license. */
export async function fulfillLifetimeCheckout({session,admin,stripe,paidAt}){
 if(session.mode!=='payment'||session.metadata?.billing_purpose!=='lifetime_license')return {handled:false};
 const userId=session.metadata?.user_id;
 if(!userId||session.client_reference_id!==userId)throw new Error('LIFETIME_OWNER_MISMATCH');
 const {data:quote,error:quoteError}=await admin.from('lifetime_checkout_quotes').select('*').eq('checkout_session_id',session.id).eq('user_id',userId).maybeSingle();
 if(quoteError||!quote||quote.plan_key!==session.metadata.plan_key||quote.kind!==session.metadata.license_kind)throw new Error('LIFETIME_QUOTE_MISSING');
 if(session.payment_status!=='paid')return {handled:true,pending:true};
 const paymentIntent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
 if(!paymentIntent||!Number.isSafeInteger(session.amount_total)||session.amount_total<=0||session.currency!=='usd')throw new Error('LIFETIME_PAYMENT_INVALID');
 const lines=await stripe.checkout.sessions.listLineItems(session.id,{limit:2});
 if(lines.data?.length!==1||lines.has_more||lines.data[0].quantity!==1||lines.data[0].price?.id!==quote.price_id||lines.data[0].price?.unit_amount!==quote.amount_cents||lines.data[0].price?.currency!=='usd')throw new Error('LIFETIME_PRICE_MISMATCH');
 const {data:applied,error}=await admin.rpc('record_lifetime_payment',{requested_user_id:userId,requested_session_id:session.id,requested_payment_intent_id:paymentIntent,requested_plan_key:quote.plan_key,requested_kind:quote.kind,requested_amount_cents:session.amount_total,requested_paid_at:paidAt});
 if(error)throw new Error('LIFETIME_FULFILLMENT_FAILED');
 const {error:tracking}=await admin.from('stripe_checkout_sessions').update({status:'complete',stripe_customer_id:typeof session.customer==='string'?session.customer:session.customer?.id||null,updated_at:new Date().toISOString()}).eq('checkout_session_id',session.id).eq('user_id',userId);
 if(tracking)throw new Error('LIFETIME_TRACKING_FAILED');
 return {handled:true,pending:false,applied};
}
