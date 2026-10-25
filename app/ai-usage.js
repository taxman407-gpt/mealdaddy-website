import {requireSession,invokeAuthenticated} from './supabase-client.js?v=20261004-1';
if(!await requireSession())throw new Error('Authentication required');
const $=s=>document.querySelector(s),today=new Date();
$('#to').value=today.toISOString().slice(0,10);$('#from').value=new Date(today.getTime()-29*86400000).toISOString().slice(0,10);
const number=value=>value==null?'—':Number(value).toLocaleString(undefined,{maximumFractionDigits:3});
const money=value=>value==null?'Unknown':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:4,maximumFractionDigits:6}).format(value);
async function load(){const button=$('#filters button');button.disabled=true;$('#results').hidden=true;$('#status').textContent='Loading usage…';try{
 const from=new Date($('#from').value+'T00:00:00Z'),to=new Date($('#to').value+'T00:00:00Z');to.setUTCDate(to.getUTCDate()+1);
 const {data,error}=await invokeAuthenticated('owner-conversion-report',{body:{action:'ai_processing',from:from.toISOString(),to:to.toISOString()}});
 if(error||!data?.ok)throw new Error('Report unavailable. Owner authorization and current MFA are required.');
 $('#summary').textContent=`${data.meal_entries} meal entries since ${new Date(data.effective_from).toLocaleString()} UTC period start. Tracking enabled ${new Date(data.tracking_started_at).toISOString()}.`;
 $('#rows').replaceChildren();for(const row of data.rows){const tr=document.createElement('tr');const values=[row.environment,row.category.replaceAll('_',' '),row.funding,...['processed_requests','photos_processed','photos_per_meal','requests_per_meal'].map(k=>number(row[k])),...['known_estimated_cost_usd','estimated_cost_per_meal','estimated_cost_per_request','allocated_cost_per_photo'].map(k=>money(row[k])),...['unpriced_calls','unresolved_calls','rejected_calls','provider_calls','search_calls'].map(k=>number(row[k]))];for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('#rows').append(tr);}
 $('#results').hidden=false;$('#status').textContent=data.rows.length?'Report loaded; access recorded.':'No tracked requests in this period.';
 }catch(error){$('#status').textContent=error.message;}finally{button.disabled=false;}}
$('#filters').addEventListener('submit',event=>{event.preventDefault();void load();});await load();
