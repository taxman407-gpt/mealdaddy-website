export async function initializeReferrals({invoke,user,root=document}){
 const find=id=>root.querySelector(`#${id}`),status=find('referral-status');
 if(!status)return;
 const request=async body=>{const {data,error}=await invoke('manage-referrals',{body});if(error){let message=error.message;try{message=(await error.context.clone().json()).error||message;}catch{}throw new Error(message);}if(data?.error)throw new Error(data.error);return data;};
 async function refresh(){
  const data=await request({action:'status'});
  find('referral-balance').textContent=`${data.pointsAvailable} available points · Affiliate balance: ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(data.commissionCents/100)}`;
  const terms=data.program.subscriberEnabled?`${data.program.pointsPerReferral} points once per new referred customer's first qualifying collected payment. Each point redeems for ${data.program.centsPerPoint} cent(s), up to $5 per billing month.`:'New subscriber referrals are paused or not yet configured. Existing earned points retain their promised terms.';
  find('referral-program-terms').textContent=terms;
  find('referral-affiliate-state').textContent=`Affiliate application: ${data.affiliateStatus||'not submitted'}. Affiliate codes require owner approval.`;
  find('subscriber-referral-code').disabled=!data.program.subscriberEnabled;
  find('affiliate-referral-code').disabled=!data.program.affiliateEnabled||data.affiliateStatus!=='approved';
  find('referral-links').replaceChildren();
  for(const item of data.codes){
   if(!item.active)continue;
   const url=new URL('./auth.html',location.href);url.searchParams.set('ref',item.code);
   const label=root.createElement?root.createElement('label'):document.createElement('label');
   label.textContent=`${item.channel==='affiliate'?'Affiliate':'Subscriber'} invite link`;
   const input=document.createElement('input');input.readOnly=true;input.value=url.href;label.append(input);find('referral-links').append(label);
  }
  const summary=find('referral-redemption-summary');summary.replaceChildren();
  for(const item of (data.redemptions||[]).filter(item=>item.status!=='released')){
   const row=document.createElement('span');row.textContent=`${(item.amount_cents/100).toFixed(2)} USD · ${item.billing_month} · ${item.status} `;summary.append(row);
   if(item.status==='reserved'&&!item.stripe_invoice_id){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel reservation';cancel.addEventListener('click',async()=>{try{await request({action:'cancel_redemption',id:item.id});await refresh();}catch(error){status.textContent=error.message;}});summary.append(cancel);}
  }
  if(!summary.childNodes.length)summary.textContent='No discounts reserved or applied.';
  status.textContent='Referral information loaded.';
 }
 for(const [id,channel] of [['subscriber-referral-code','subscriber'],['affiliate-referral-code','affiliate']])find(id).addEventListener('click',async()=>{try{await request({action:'create_code',channel});await refresh();}catch(error){status.textContent=error.message;}});
 find('apply-affiliate').addEventListener('click',async()=>{try{await request({action:'apply_affiliate'});await refresh();}catch(error){status.textContent=error.message;}});
 find('referral-redemption-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
  try{const result=await request({action:'reserve_redemption',points:Number(find('referral-points').value)});await refresh();status.textContent=result.message;}
  catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 });
 try{await refresh();}catch(error){status.textContent=error.message||'Referral information is unavailable.';}
}
