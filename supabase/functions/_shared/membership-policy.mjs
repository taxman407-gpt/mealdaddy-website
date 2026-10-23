export const membershipPlans = Object.freeze({
  core: Object.freeze({key:'core',name:'Standard',mode:'subscription',amountCents:999,currency:'usd',priceVariable:'STRIPE_CORE_PRICE_ID',ai:'hosted'}),
  byo: Object.freeze({key:'byo',name:'BYOK',mode:'subscription',amountCents:699,currency:'usd',priceVariable:'STRIPE_BYO_PRICE_ID',ai:'byok'}),
  core_lifetime: Object.freeze({key:'core_lifetime',name:'Standard Founding Member Lifetime',mode:'payment',amountCents:35000,currency:'usd',priceVariable:'STRIPE_CORE_LIFETIME_PRICE_ID',ai:'hosted',maintenanceCents:6000}),
  byo_lifetime: Object.freeze({key:'byo_lifetime',name:'BYOK Founding Member Lifetime',mode:'payment',amountCents:25000,currency:'usd',priceVariable:'STRIPE_BYO_LIFETIME_PRICE_ID',ai:'byok',maintenanceCents:4200})
});
export function assertPlanPrice(key,price){
  const plan=membershipPlans[key];
  if(!plan || !price?.active || price.currency!==plan.currency || price.unit_amount!==plan.amountCents)throw new Error('The configured price does not match the disclosed membership.');
  if(plan.mode==='subscription' && (price.type!=='recurring'||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1))throw new Error('The configured plan must bill monthly.');
  if(plan.mode==='payment' && (price.type!=='one_time'||price.recurring))throw new Error('A lifetime license must be a one-time purchase.');
  return plan;
}
export function addUtcYears(value,years){
  const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new Error('Invalid license date.');
  const month=date.getUTCMonth();date.setUTCFullYear(date.getUTCFullYear()+years);
  if(date.getUTCMonth()!==month)date.setUTCDate(0);
  return date.toISOString();
}
export function lifetimeAccess(license,now=new Date()){
  if(!license || license.status!=='paid' || !['core','byo'].includes(license.plan_key))return {licenseValid:false,active:false};
  const includedThrough=addUtcYears(license.purchased_at,3);
  const renewed=Date.parse(license.maintenance_paid_through||'');
  const through=Number.isFinite(renewed)?new Date(Math.max(Date.parse(includedThrough),renewed)).toISOString():includedThrough;
  return {licenseValid:true,active:new Date(now).getTime()<Date.parse(through),plan:license.plan_key,accessThrough:through};
}
export function maintenanceQuote(license,{now=new Date(),changes=[]}={}){
  const access=lifetimeAccess(license,now);if(!access.licenseValid)throw new Error('A valid lifetime license is required.');
  const base=membershipPlans[`${license.plan_key}_lifetime`];let amountCents=base.maintenanceCents;
  for(const change of [...changes].sort((a,b)=>Date.parse(a.effectiveAt)-Date.parse(b.effectiveAt))){
    if(change.plan!==license.plan_key)continue;
    const effective=Date.parse(change.effectiveAt),notice=Date.parse(change.notifiedAt);
    if(!Number.isFinite(effective)||!Number.isFinite(notice)||effective-notice<60*86400000)throw new Error('Maintenance changes require at least 60 days advance notice.');
    if(!Number.isSafeInteger(change.amountCents)||change.amountCents<0)throw new Error('Invalid maintenance amount.');
    if(effective<=new Date(now).getTime())amountCents=change.amountCents;
  }
  // Restart from the renewal date after a lapse. Never charge skipped years.
  const from=Math.max(new Date(now).getTime(),Date.parse(access.accessThrough));
  return {amountCents,currency:'usd',backFeesCents:0,accessThrough:addUtcYears(from,1),automaticRenewal:false};
}
