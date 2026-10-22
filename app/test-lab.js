import { fixtureEstimate, fixtureDescriptions } from './test-fixtures.mjs';
import { splitMealPortion, mealDescriptionWithPortion } from './meal-portion.js';
import { createMealDrafts } from './meal-drafts.js';
const $ = selector => document.querySelector(selector);
const drafts = createMealDrafts('synthetic-lab');
const ledgerKey = 'mealdaddy-synthetic-lab-ledger-v1';
let entries = [];
try { entries = JSON.parse(localStorage.getItem(ledgerKey) || '[]'); } catch {}
if (!Array.isArray(entries)) entries = [];
let editingId = null, photo = null, requestId = crypto.randomUUID();
function snapshot() { return { description:$('#description').value, percentage:$('#percentage').value, notes:$('#notes').value, photo, editingId, requestId }; }
function announce(message) { $('#status').textContent = message; }
function autosave() { return drafts.save('meal',snapshot()).then(() => {$('#draft-state').textContent='Draft saved on this device.';}, () => {$('#draft-state').textContent='Draft could not be fully saved. Keep this page open.';}); }
function reset() { editingId=null;photo=null;requestId=crypto.randomUUID();$('#notes').value='';$('#percentage').value='100';$('#photo').value='';$('#photo-state').textContent='No draft photo.';$('#cancel-edit').hidden=true; }
function render() {
  $('#entries').replaceChildren();
  const totals={calories:0,carbs_g:0,fiber_g:0,net_carbs_g:0};
  for (const entry of entries) {
    const estimate=fixtureEstimate(entry.description);
    if (!estimate) continue;
    for(const field in totals) totals[field]+=estimate[field];
    const div=document.createElement('article');div.className='entry';
    const title=document.createElement('strong');title.textContent=entry.description;div.append(title);
    const stamp=document.createElement('small');stamp.textContent=`${new Date(entry.occurredAt).toLocaleString()} · ID ${entry.id.slice(0,8)} · fixed test values`;div.append(stamp);
    const metrics=document.createElement('p');metrics.textContent=`${estimate.calories} cal · ${estimate.protein_g} g protein · ${estimate.carbs_g} g carbs · ${estimate.fiber_g} g fiber · ${estimate.net_carbs_g} g net carbs`;div.append(metrics);
    const parts=document.createElement('p');parts.textContent=estimate.components.map(component=>component.name).join(' + ');div.append(parts);
    const actions=document.createElement('div');actions.className='actions';
    const edit=document.createElement('button');edit.type='button';edit.textContent='Edit meal';edit.addEventListener('click',()=>{const portion=splitMealPortion(entry.description);editingId=entry.id;requestId=entry.id;$('#description').value=portion.description;$('#percentage').value=portion.percentage;$('#notes').value=entry.notes||'';photo=null;$('#photo').value='';$('#photo-state').textContent='No draft photo.';$('#cancel-edit').hidden=false;$('#description').focus();void autosave();});actions.append(edit);
    const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Delete sample';remove.addEventListener('click',()=>{entries=entries.filter(item=>item.id!==entry.id);localStorage.setItem(ledgerKey,JSON.stringify(entries));if(editingId===entry.id){reset();void drafts.remove('meal');}render();announce('Sample removed and totals recalculated.');});actions.append(remove);div.append(actions);$('#entries').append(div);
  }
  $('#totals').textContent=`${entries.length} sample meal${entries.length===1?'':'s'} · ${totals.calories} calories · ${totals.carbs_g} g carbs · ${totals.fiber_g} g fiber · ${totals.net_carbs_g} g net carbs`;
  $('#totals').className='metrics';
  if (entries.length && $('#status').textContent === 'No sample meals saved yet.') announce('Saved sample meals restored from this browser.');
}
for (const description of fixtureDescriptions) {const button=document.createElement('button');button.type='button';button.textContent=description;button.addEventListener('click',()=>{$('#description').value=description;$('#description').focus();void autosave();});$('#samples').append(button);}
$('#sample-form').addEventListener('input',()=>void autosave());
$('#photo').addEventListener('change',()=>{photo=$('#photo').files[0]||null;$('#photo-state').textContent=photo?`Draft photo: ${photo.name}. Preserved locally; no image analysis is performed.`:'No draft photo.';void autosave();});
$('#sample-form').addEventListener('submit',async event=>{event.preventDefault();try{const description=mealDescriptionWithPortion($('#description').value,$('#percentage').value);const previous=entries.find(item=>item.id===editingId);const entry={id:editingId||requestId,description,notes:$('#notes').value,occurredAt:previous?.occurredAt||new Date().toISOString()};const index=entries.findIndex(item=>item.id===entry.id);if(index>=0)entries[index]=entry;else entries.push(entry);localStorage.setItem(ledgerKey,JSON.stringify(entries));await drafts.remove('meal');reset();render();$('#draft-state').textContent='';announce('Sample saved. Edits replace the same row and preserve its timestamp. Draft photo was not added to the ledger.');}catch(error){announce(error.message);}});
$('#discard-draft').addEventListener('click',async()=>{await drafts.remove('meal');reset();$('#draft-state').textContent='Draft discarded.';});
$('#cancel-edit').addEventListener('click',async()=>{await drafts.remove('meal');reset();$('#draft-state').textContent='Edit cancelled; saved meal unchanged.';});
window.addEventListener('pagehide',()=>{if($('#notes').value||photo||editingId)void autosave();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void autosave();});
const draft=await drafts.read('meal');
if(draft){$('#description').value=draft.description;$('#percentage').value=draft.percentage;$('#notes').value=draft.notes||'';editingId=entries.some(entry=>entry.id===draft.editingId)?draft.editingId:null;requestId=draft.requestId||crypto.randomUUID();photo=draft.photo||null;$('#photo-state').textContent=photo?`Restored draft photo: ${photo.name}. No image analysis.`:'No draft photo.';$('#cancel-edit').hidden=!editingId;$('#draft-state').textContent='Your unfinished draft was restored. No meal was submitted.';}
render();
