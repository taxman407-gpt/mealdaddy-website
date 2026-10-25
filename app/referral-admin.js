import {requireSession,invokeAuthenticated} from './supabase-client.js?v=20261004-1';
if(!await requireSession())throw new Error('Authentication required');
const $=selector=>document.querySelector(selector),status=$('#owner-referral-status');
async function request(body){const {data,error}=await invokeAuthenticated('manage-referrals',{body});if(error){let message=error.message;try{message=(await error.context.clone().json()).error||message;}catch{}throw new Error(message);}return data;}
async function load(){const data=await request({action:'owner_status'});if(!data?.ok)throw new Error('Owner authorization failed.');const settings=data.settings;$('#affiliate-enabled').checked=settings.affiliate_enabled;$('#subscriber-enabled').checked=settings.subscriber_enabled;$('#points-per-referral').value=settings.points_per_referral??'';$('#cents-per-point').value=settings.cents_per_point??'';$('#affiliate-applications').replaceChildren();for(const application of data.applications){const row=document.createElement('p');row.textContent=`${application.user_id} · ${application.status}`;$('#affiliate-applications').append(row);}$('#owner-referral-controls').hidden=false;status.textContent='Owner authorization verified. Referral settings loaded.';}
$('#owner-referral-settings').addEventListener('submit',async event=>{event.preventDefault();try{await request({action:'owner_configure',affiliateEnabled:$('#affiliate-enabled').checked,subscriberEnabled:$('#subscriber-enabled').checked,pointsPerReferral:$('#points-per-referral').value?Number($('#points-per-referral').value):null,centsPerPoint:$('#cents-per-point').value?Number($('#cents-per-point').value):null});await load();}catch(error){status.textContent=error.message;}});
async function approval(action){try{await request({action,userId:$('#affiliate-user-id').value.trim()});await load();}catch(error){status.textContent=error.message;}}
$('#affiliate-approval').addEventListener('submit',event=>{event.preventDefault();void approval('owner_approve_affiliate');});$('#reject-affiliate').addEventListener('click',()=>void approval('owner_reject_affiliate'));
try{await load();}catch(error){$('#owner-referral-controls').hidden=true;status.textContent=error.message;}

let commissionCursor = null, commissionLoading = false;
const commissionMoney = cents => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(Number(cents)/100);
async function loadCommissions(next=false) {
 if(commissionLoading)return;
 commissionLoading=true;
 const message=$('#commission-status'),button=$('#load-commissions'),nextButton=$('#next-commissions');
 button.disabled=true;nextButton.disabled=true;message.textContent='Loading commission records…';
 try {
  const data=await request({action:'owner_commissions',...(next&&commissionCursor?{after:commissionCursor}:{})});
  if(!data?.ok||!Array.isArray(data.rows))throw Error('Commission ledger is unavailable.');
  const rows=$('#commission-rows');rows.replaceChildren();
  let balance=0;
  for(const row of data.rows){
   const tr=document.createElement('tr');const remaining=Number(row.amount_cents)-Number(row.paid_out_cents);balance+=remaining;
   for(const value of [row.referrer_user_id,row.receipt_key,`${Number(row.rate_basis_points)/100}%`,commissionMoney(row.amount_cents),commissionMoney(row.paid_out_cents),commissionMoney(remaining)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
   rows.append(tr);
  }
  commissionCursor=data.nextCursor;nextButton.hidden=!commissionCursor;
  message.textContent=data.rows.length?`${data.rows.length} records on this page · Page balance ${commissionMoney(balance)}. These are page totals, not a payout authorization.`:'No commission records found.';
 }catch(error){$('#commission-rows').replaceChildren();commissionCursor=null;nextButton.hidden=true;message.textContent=error.message;}
 finally{commissionLoading=false;button.disabled=false;nextButton.disabled=false;}
}
$('#load-commissions').addEventListener('click',()=>void loadCommissions());
$('#next-commissions').addEventListener('click',()=>void loadCommissions(true));
