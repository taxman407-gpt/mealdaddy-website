import {eligibleCollectedNet} from './referral-policy.mjs';
export function invoiceSubscriptionId(invoice){const value=invoice.subscription||invoice.parent?.subscription_details?.subscription;return typeof value==='string'?value:value?.id||null;}
export async function recordSubscriptionReferral({invoice,userId,admin,stripe,paidAt,eligiblePriceIds=[]}){
 if(invoice.status!=='paid'||Number(invoice.amount_paid)<=0||invoice.paid_out_of_band||invoice.currency!=='usd')return {recorded:0};
 const {data:attribution,error:attributionError}=await admin.from('referral_attributions').select('referred_user_id').eq('referred_user_id',userId).maybeSingle();
 if(attributionError)throw new Error('REFERRAL_ATTRIBUTION_LOOKUP_FAILED');
 if(!attribution)return {recorded:0};
 const lines=await stripe.invoices.listLineItems(invoice.id,{limit:100});
 if(lines.has_more||!eligiblePriceIds.length||Number(invoice.shipping_cost?.amount_subtotal||0)>0)throw new Error('REFERRAL_INVOICE_RECONCILIATION_REQUIRED');
 for(const line of lines.data||[]){
  if(Number(line.amount)<=0)continue;
  const raw=line.price||line.pricing?.price_details?.price;
  const priceId=typeof raw==='string'?raw:raw?.id;
  if(!eligiblePriceIds.includes(priceId))throw new Error('REFERRAL_MIXED_INVOICE_REQUIRES_REVIEW');
 }
 let netTotal;
 if(Number.isSafeInteger(invoice.total_excluding_tax))netTotal=invoice.total_excluding_tax;
 else if(Number.isSafeInteger(invoice.tax))netTotal=Math.max(0,Number(invoice.total)-invoice.tax);
 else if(Array.isArray(invoice.total_tax_amounts))netTotal=Math.max(0,Number(invoice.total)-invoice.total_tax_amounts.reduce((sum,tax)=>sum+Number(tax.amount),0));
 else throw new Error('REFERRAL_TAX_RECONCILIATION_REQUIRED');
 const payments=await stripe.invoicePayments.list({invoice:invoice.id,status:'paid',limit:100});
 if(payments.has_more)throw new Error('REFERRAL_PAYMENT_PAGINATION_REQUIRED');
 const byIntent=new Map();
 for(const payment of payments.data||[]){
  const raw=payment.payment?.payment_intent;
  const id=typeof raw==='string'?raw:raw?.id;
  if(!id||payment.payment.type!=='payment_intent'||Number(payment.amount_paid)<=0)continue;
  byIntent.set(id,(byIntent.get(id)||0)+Number(payment.amount_paid));
 }
 // Support the original webhook object shape while using the current payment allocation API.
 if(!byIntent.size&&invoice.payment_intent){const id=typeof invoice.payment_intent==='string'?invoice.payment_intent:invoice.payment_intent.id;byIntent.set(id,Number(invoice.amount_paid));}
 let recorded=0;
 for(const [id,allocated] of byIntent){
  const payment=await stripe.paymentIntents.retrieve(id);
  const paymentCustomer=typeof payment.customer==='string'?payment.customer:payment.customer?.id;
  const invoiceCustomer=typeof invoice.customer==='string'?invoice.customer:invoice.customer?.id;
  if(!invoiceCustomer||paymentCustomer!==invoiceCustomer)throw new Error('REFERRAL_PAYMENT_OWNER_MISMATCH');
  if(payment.status!=='succeeded'||!Number.isSafeInteger(payment.amount_received)||payment.amount_received<allocated)throw new Error('REFERRAL_PAYMENT_NOT_COLLECTED');
  const net=eligibleCollectedNet({amountPaidCents:allocated,totalCents:Number(invoice.total),totalExcludingTaxCents:netTotal});
  if(!net)continue;
  const {error}=await admin.rpc('record_referral_receipt',{requested_receipt_key:`invoice:${invoice.id}:${id}`,requested_payment_intent_id:id,requested_user_id:userId,requested_kind:'subscription',requested_paid_at:paidAt,requested_net_cents:net,requested_collected_gross_cents:allocated,requested_payment_gross_cents:payment.amount_received});
  if(error)throw new Error('REFERRAL_RECEIPT_RECORDING_FAILED');
  recorded++;
 }
 return {recorded};
}
export async function recordLifetimeReferral({session,userId,admin,paidAt}){
 if(session.payment_status!=='paid'||session.metadata?.license_kind!=='purchase')return;
 const id=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
 const total=Number(session.amount_total),tax=session.total_details?.amount_tax;
 if(!Number.isSafeInteger(tax)||tax<0)throw new Error('REFERRAL_TAX_RECONCILIATION_REQUIRED');
 if(!id||!Number.isSafeInteger(total)||total<=0)return;
 const net=eligibleCollectedNet({amountPaidCents:total,totalCents:total,totalExcludingTaxCents:Math.max(0,total-tax)});
 if(!net)return;
 const {error}=await admin.rpc('record_referral_receipt',{requested_receipt_key:`lifetime:${session.id}`,requested_payment_intent_id:id,requested_user_id:userId,requested_kind:'lifetime',requested_paid_at:paidAt,requested_net_cents:net,requested_collected_gross_cents:total,requested_payment_gross_cents:total});
 if(error)throw new Error('LIFETIME_REFERRAL_RECORDING_FAILED');
}
