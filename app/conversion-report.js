import {registrationCsv,reportColumns} from "./report-csv.js?v=20261022-1";
import {requireSession,invokeAuthenticated} from './supabase-client.js?v=20261004-1';
if(!await requireSession())throw new Error('Authentication required');
const $=s=>document.querySelector(s),status=$('#report-status');let offset=0,total=0;
function filters(){const from=$('#report-from').value,to=$('#report-to').value;return {from:from?`${from}T00:00:00.000Z`:null,to:to?`${to}T00:00:00.000Z`:null,status:$('#conversion-status').value,verified:$('#report-verified').value,marketing:$('#report-marketing').value,offset,limit:100};}
async function request(action){const {data,error}=await invokeAuthenticated('owner-conversion-report',{body:{action,...filters()}});if(error)throw new Error('Report access failed. Owner authorization and current MFA are required.');if(!data?.ok)throw new Error('Report unavailable.');return data;}
function cell(value){return value===null||value===undefined?'Not recorded':String(value);}

async function load(){try{const data=await request('view');total=data.summary.registrations;$('#report-controls').hidden=false;$('#report-rows').replaceChildren();for(const row of data.rows){const tr=document.createElement('tr');for(const key of reportColumns){const td=document.createElement('td');td.textContent=cell(row[key]);tr.append(td);}$('#report-rows').append(tr);}$('#report-summary').textContent=`${total} registrations matching filters; ${data.summary.verified} verified; ${data.summary.started_checkout} started checkout; ${data.summary.active_trials} active trials; ${data.summary.paid_conversions} verified paid conversions (${(data.summary.paid_conversion_rate*100).toFixed(1)}% of matching registrations); ${data.summary.incomplete_checkouts} incomplete checkouts.`;$('#report-notes').textContent=data.notes.join(' ');$('#report-page').textContent=`Showing ${total?offset+1:0}–${Math.min(offset+100,total)} of ${total}`;$('#report-prev').disabled=offset===0;$('#report-next').disabled=offset+100>=total;status.textContent='Owner authorization verified. Report loaded and access recorded.';}catch(error){status.textContent=error.message;$('#report-controls').hidden=true;}}
$('#report-filters').addEventListener('submit',event=>{event.preventDefault();offset=0;void load();});$('#report-prev').addEventListener('click',()=>{offset=Math.max(0,offset-100);void load();});$('#report-next').addEventListener('click',()=>{offset+=100;void load();});
$('#report-export').addEventListener('click',async()=>{try{const data=await request('export'),keys=Object.keys(data.rows[0]||{});if(!keys.length){status.textContent='No rows to export.';return;}const text=registrationCsv(data.rows);const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='mealdaddy-registration-page.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Current page exported; export access recorded.';}catch(error){status.textContent=error.message;}});
await load();

try {
 const {data,error}=await invokeAuthenticated('owner-conversion-report',{body:{action:'welcome_status'}});
 if(error||!data?.ok)throw new Error('Delivery monitoring is unavailable.');
 $('#welcome-monitor').textContent=`Welcome sending ${data.settings?.enabled?'enabled':'disabled'}. ${data.alertCount} deliveries require owner review. `+data.alerts.map(row=>`${row.user_id}: ${row.status} (${row.last_error_code||'unknown'})`).join('; ');
} catch(error) {$('#welcome-monitor').textContent=error.message;}
