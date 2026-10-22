/** Apply a bounded negative invoice item; existing coupons are left intact. */
export async function applyReferralInvoiceDiscount({invoice,userId,admin,stripe}){
 if(invoice.status!=='draft'||invoice.currency!=='usd'||!invoice.customer||Number(invoice.amount_due)<=0)return {applied:false};
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date(Number(invoice.period_start)*1000)).map(part=>[part.type,part.value]));
 const {data:redemption,error}=await admin.rpc('claim_referral_invoice_discount',{requested_user_id:userId,requested_invoice_id:invoice.id,requested_month:`${parts.year}-${parts.month}-01`,requested_max_cents:Math.max(0,Math.floor(Number(invoice.amount_due)))});
 if(error)throw new Error('REFERRAL_DISCOUNT_CLAIM_FAILED');
 if(!redemption)return {applied:false};
 if(redemption.status==='applied')return {applied:true,id:redemption.id};
 // Look up a prior successful API write before retrying, even after Stripe's idempotency window.
 const lines=await stripe.invoices.listLineItems(invoice.id,{limit:100});
 let item=lines.data?.find(line=>line.metadata?.mealdaddy_referral_redemption===redemption.id);
 if(!item){
  if(lines.has_more)throw new Error('REFERRAL_INVOICE_RECONCILIATION_REQUIRED');
  item=await stripe.invoiceItems.create({customer:typeof invoice.customer==='string'?invoice.customer:invoice.customer.id,invoice:invoice.id,currency:'usd',amount:-Number(redemption.amount_cents),discountable:false,description:'MealDaddy subscriber referral discount',metadata:{mealdaddy_referral_redemption:redemption.id}},{idempotencyKey:`mealdaddy-referral-${redemption.id}`});
 }
 const {error:saveError}=await admin.from('referral_redemptions').update({status:'applied',stripe_invoice_item_id:item.id}).eq('id',redemption.id).eq('user_id',userId).eq('stripe_invoice_id',invoice.id);
 if(saveError)throw new Error('REFERRAL_DISCOUNT_RECONCILIATION_REQUIRED');
 return {applied:true,id:redemption.id,amountCents:Number(redemption.amount_cents)};
}
