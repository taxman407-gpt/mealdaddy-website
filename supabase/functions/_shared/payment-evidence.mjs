// Called only after Stripe webhook signature verification and subscription/customer ownership checks.
export async function recordPaymentEvidence({invoice,userId,subscriptionId,eventId,eventCreated,stripe,admin}) {
 if(invoice.status!=='paid'||invoice.paid_out_of_band||!Number.isSafeInteger(invoice.amount_paid)||invoice.amount_paid<=0)return false;
 const customer=typeof invoice.customer==='string'?invoice.customer:invoice.customer?.id;
 if(!customer||!subscriptionId)throw new Error('PAYMENT_EVIDENCE_OWNERSHIP_REQUIRED');
 const payments=await stripe.invoicePayments.list({invoice:invoice.id,status:'paid',limit:100});
 if(payments.has_more)throw new Error('PAYMENT_EVIDENCE_PAGINATION_REQUIRED');
 const allocations=new Map();
 for(const payment of payments.data||[]){const raw=payment.payment?.payment_intent,id=typeof raw==='string'?raw:raw?.id;if(payment.payment?.type==='payment_intent'&&id&&Number.isSafeInteger(payment.amount_paid)&&payment.amount_paid>0)allocations.set(id,(allocations.get(id)||0)+payment.amount_paid);}
 if(!allocations.size&&invoice.payment_intent){const id=typeof invoice.payment_intent==='string'?invoice.payment_intent:invoice.payment_intent.id;allocations.set(id,invoice.amount_paid);}
 let collected=0;
 for(const [id,allocated] of allocations){const intent=await stripe.paymentIntents.retrieve(id);const owner=typeof intent.customer==='string'?intent.customer:intent.customer?.id;if(owner!==customer||intent.status!=='succeeded'||!Number.isSafeInteger(intent.amount_received)||intent.amount_received<allocated)throw new Error('PAYMENT_EVIDENCE_NOT_VERIFIED');collected+=allocated;}
 if(!collected)return false;
 if(collected>invoice.amount_paid)throw new Error('PAYMENT_EVIDENCE_ALLOCATION_MISMATCH');
 const paidAt=invoice.status_transitions?.paid_at||eventCreated;if(!Number.isFinite(paidAt))throw new Error('PAYMENT_EVIDENCE_TIMESTAMP_REQUIRED');
 const {error}=await admin.from('billing_payment_evidence').upsert({invoice_id:invoice.id,user_id:userId,stripe_subscription_id:subscriptionId,amount_paid_cents:collected,currency:invoice.currency,paid_at:new Date(paidAt*1000).toISOString(),stripe_event_id:eventId},{onConflict:'invoice_id',ignoreDuplicates:true});
 if(error)throw new Error('PAYMENT_EVIDENCE_RECORDING_FAILED');return true;
}
