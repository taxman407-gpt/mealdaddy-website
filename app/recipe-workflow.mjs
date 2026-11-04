import {escapeHtml as e, ingredientLines, parseIngredients, buildShoppingRows, purchaseAmount, sourceLink, shoppingText, recipeText} from './recipe-workflow-core.mjs';

// Beta-only UI; supplied adapters retain existing authenticated/provider routing.
export function initRecipeWorkflow({userId, invoke, favorites, navigate, nutritionContext, failure}) {
  if (!userId || document.querySelector('#rw-recreate')) return;
  const key = `mealdaddy-recipe-workflow-v1:${userId}`;
  let data = {recipes:[],list:{title:'Shopping list',sources:[],rows:[],dirty:false}};
  let mode = 'favorite', current = null, busy = false, loadFailed = false, active = true;
  const root = document.createElement('section');
  root.id = 'rw-recreate'; root.className = 'rw-panel';
  const shopping = document.createElement('section');
  shopping.id = 'rw-shopping'; shopping.className = 'rw-panel';
  const dashboard = document.querySelector('.dashboard');
  if (!dashboard) return;
  dashboard.append(root,shopping);
  const style = document.createElement('link'); style.rel='stylesheet'; style.href=new URL('./recipe-workflow.css',import.meta.url).href; document.head.append(style);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved) {
      if (!Array.isArray(saved.recipes) || !Array.isArray(saved.list?.sources) || !Array.isArray(saved.list?.rows)) throw new Error('Invalid saved format');
      data=saved;
    }
  } catch { loadFailed=true; }
  const q = (selector) => root.querySelector(selector);
  const qs = (selector) => shopping.querySelector(selector);
  const notice = '<p class="rw-note">Beta: this recipe library and shopping list are saved on this device only, not synced. Export a copy for safekeeping. Generated recipes may also be cached by the existing recipe service. Avoid shared devices.</p>';
  const button = (label, action, extra='') => `<button type="button" data-rw="${action}" ${extra}>${label}</button>`;
  function status(message) {
    if(!active)return;
    for (const panel of [root,shopping]) {
      let node=panel.querySelector('.rw-status');
      if(!node){node=document.createElement('p');node.className='rw-status';node.setAttribute('role','status');panel.append(node);}
      node.textContent=message;
    }
  }
  function persist() {
    if(loadFailed) throw new Error('Existing device data could not be read. It has not been overwritten. Export this session or clear device data before saving.');
    try { localStorage.setItem(key,JSON.stringify(data)); }
    catch { throw new Error('Device storage could not save this change. Export a text copy before closing.'); }
  }
  function safeAction(action) {try {action();} catch(error){status(error.message || 'The change could not be completed.');}}
  function openRecipes() {
    navigate('plan','recreate');
    if (!root.querySelector('#rw-request')) renderStart();
    refreshFavorites();
    root.querySelector('h1')?.focus();
    if(loadFailed) status('Existing device data could not be read and will not be overwritten.');
  }
  function availableFavorites() { return [...(favorites() || []),...data.recipes.filter(r=>r.favorite).map(r=>({id:`recipe:${r.id}`,label:`${r.recipe.title} · saved recipe`,description:r.description}))]; }
  function refreshFavorites() {
    const select=q('#rw-favorite'); if(!select)return;
    const prior=select.value;
    select.replaceChildren(new Option('Choose a saved meal…',''),...availableFavorites().map(f=>new Option(f.label,f.id)));
    select.value=prior;
    q('#rw-favorite-help').textContent=select.options.length>1 ? 'Choose a meal, then review its description. You can also find matching restaurant menu choices.' : 'No saved meal favorites are available yet. Describe a meal, find it on a restaurant menu, or refresh after My Foods loads.';
  }
  function renderStart() {
    root.innerHTML=`${button('← Back to Plan','back-plan')}<p class="rw-kicker">Plan · Recreate</p><h1 tabindex="-1">Recreate a Favorite Meal</h1><p>Choose a meal, review the changes, then make it at home.</p>
      <form id="rw-request"><fieldset><legend>1. Start with a meal</legend><div class="rw-actions">
      ${button('Choose a favorite','mode','data-mode="favorite" aria-pressed="true"')}${button('Find on a restaurant menu','mode','data-mode="restaurant" aria-pressed="false"')}${button('Describe a meal','mode','data-mode="description" aria-pressed="false"')}
      </div><div id="rw-favorites"><label for="rw-favorite">Your favorite meals</label><select id="rw-favorite"></select><p id="rw-favorite-help" class="rw-note"></p>${button('Refresh favorites','refresh-favorites')}</div>
      <label for="rw-description" id="rw-description-label">Meal description</label><textarea id="rw-description" rows="4" maxlength="1000" placeholder="Describe the dish, flavors, and changes you want."></textarea>
      <p id="rw-menu-help" class="rw-note" hidden>Enter the restaurant, location or ZIP code, and the dish or flavors you want. Uses the same menu-research service as Restaurant Mode. Suggestions must be reviewed; availability is not guaranteed.</p>
      <div class="rw-actions"><button id="rw-next" type="submit">Review this meal</button></div></fieldset></form>
      <div id="rw-choices"></div><div id="rw-review"></div><div id="rw-result"></div><p class="rw-status" role="status"></p>${notice}`;
    refreshFavorites();mode='favorite';
  }
  function changeMode(next) {
    if(busy)return;
    mode=next;current=null;menuChoices=[];q('#rw-request').hidden=false;q('#rw-choices').hidden=false;q('#rw-review').hidden=false;
    q('#rw-favorites').hidden=mode!=='favorite';q('#rw-menu-help').hidden=mode!=='restaurant';
    q('#rw-description-label').textContent=mode==='restaurant'?'Restaurant, location, and meal to match':'Meal description';
    q('#rw-next').textContent=mode==='restaurant'?'Find matching menu choices':'Review this meal';
    root.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    q('#rw-choices').replaceChildren();q('#rw-review').replaceChildren();q('#rw-result').replaceChildren();status('');
  }
  async function call(name, body) {
    const {data:result,error}=await invoke(name,{body});
    if(!active) throw new Error('Session ended. No result was applied.');
    if(error){const details=await failure(error);throw new Error(details?.message || error.message || 'The request failed.');}
    if(result?.error)throw new Error(result.error);
    return result;
  }
  async function run(task) {
    if(busy)return;busy=true;
    const controls=[...root.querySelectorAll('input,textarea,select,button')];controls.forEach(x=>x.disabled=true);
    try {await task();} catch(error){status(error.message || 'The request could not finish.');}
    finally {busy=false;controls.forEach(x=>x.disabled=false);}
  }
  let menuChoices=[];
  function renderChoices(plan) {
    menuChoices=Array.isArray(plan?.options)?plan.options:[];
    if(!menuChoices.length)throw new Error('No menu matches were returned. Refine the restaurant or describe the meal instead.');
    q('#rw-request').hidden=true;q('#rw-choices').hidden=false;
    q('#rw-choices').innerHTML=`${button('← Edit restaurant search','edit-search')}<h2>2. Choose a menu match</h2><p>${e(plan.overview || '')}</p><div class="rw-cards">${menuChoices.map((o,i)=>{
      let url='';try{const u=new URL(o.source_url);if(u.protocol==='https:'&&!u.username&&!u.password)url=u.href;}catch{}
      return `<article><h3>${e(o.title)}</h3><p>${e(o.restaurant_name || plan.restaurant)}</p><p>${e(o.order)}</p><p>${e(o.why || '')}</p><h4>Suggested substitutions</h4><ul>${(o.substitutions || []).map(s=>`<li>${e(s)}</li>`).join('')}</ul><p class="rw-note">${url?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">Menu research source</a>`:'Menu source not verified; treat this as an estimate.'}${plan.source_checked_on?` · Checked ${e(plan.source_checked_on)}`:''}</p>${button('Review this choice','choose',`data-index="${i}"`)}</article>`;
    }).join('')}</div>`;
  }
  function review(description, substitutions=[]) {
    current=null;q('#rw-result').replaceChildren();q('#rw-request').hidden=true;q('#rw-choices').hidden=true;q('#rw-review').hidden=false;
    q('#rw-review').innerHTML=`<fieldset><legend>Does this work for you?</legend><p>Review the meal and suggested substitutions before generating a recipe. Your saved dietary restrictions still apply.</p><label for="rw-confirm-description">Meal to recreate — edit as needed</label><textarea id="rw-confirm-description" rows="4">${e(description)}</textarea>
      ${substitutions.length?`<h3>Substitutions to include</h3>${substitutions.map((s,i)=>`<label class="rw-check"><input type="checkbox" data-substitution="${i}" value="${e(s)}" checked><span>${e(s)}</span></label>`).join('')}`:''}
      <label for="rw-detail">Recipe style</label><select id="rw-detail"><option value="quick">Quick &amp; Close — simpler home cooking</option><option value="detailed">Detailed Recreation — sauces and technique</option></select>
      <label class="rw-check"><input id="rw-flavor" type="checkbox" checked><span>Include suitable herbs or sauce, with quantities and instructions.</span></label>
      <p class="rw-note">The current recipe service accepts 500 characters for the combined description and changes. Longer requests are flagged, never silently shortened.</p>
      <div class="rw-actions">${button('Yes, generate my recipe','generate')}${button('Change my choice','change-choice')}</div></fieldset>`;
    q('#rw-review').scrollIntoView({block:'start',behavior:'smooth'});
  }
  function renderRecipe() {
    const r=current.recipe;
    q('#rw-request').hidden=true;q('#rw-choices').hidden=true;q('#rw-review').hidden=true;q('#rw-result').hidden=false;
    q('#rw-result').innerHTML=`<div class="rw-actions">${button('← Edit meal or substitutions','edit-confirmed')}${button('Choose another meal','start-over')}</div><article class="rw-recipe"><h2>${e(r.title)}</h2><p>${e(r.summary || '')}</p><p><strong>Yield:</strong> ${e(r.servings)} servings · An at-home interpretation, not a proprietary restaurant recipe.</p>
      <h3>Ingredients</h3><ul>${r.ingredients.map(i=>`<li>${e(i.amount)} ${e(i.item)}</li>`).join('')}</ul><h3>Instructions</h3><ol>${r.instructions.map(s=>`<li>${e(s)}</li>`).join('')}</ol>
      ${(r.substitutions || []).length?`<h3>Substitutions</h3><ul>${r.substitutions.map(s=>`<li>${e(s)}</li>`).join('')}</ul>`:''}
      <details><summary>Estimated nutrition per serving</summary><dl>${Object.entries(r.nutrition || {}).map(([k,v])=>`<dt>${e(k.replaceAll('_',' '))}</dt><dd>${e(v)}</dd>`).join('')}</dl></details><p class="rw-note">${e(r.source_note || 'Nutrition is estimated.')}</p>
      <div class="rw-actions">${button('Save Recipe','save')}${button('Save as Favorite','favorite')}${button('Export Text','recipe-text')}${button('Print / Save PDF','recipe-print')}</div>
      <h3>Include this in a shopping list?</h3><div class="rw-actions">${button('Save & Add to Shopping List','add-shopping')}${button('Save to consider later','consider')}${button('Not now','not-now')}</div></article>`;
  }
  function saveRecipe(favorite=false) {
    if(!current)throw new Error('Generate a recipe first.');
    const prior=data.recipes.find(r=>r.id===current.id);
    const saved={...current,favorite:favorite || Boolean(prior?.favorite)};
    if(prior)data.recipes[data.recipes.indexOf(prior)]=saved;else data.recipes.push(saved);
    persist();return saved;
  }
  function addSource(saved) {
    const id=`recipe-${saved.id}`;
    const old=data.list.sources.find(s=>s.id===id);
    if(old){old.active=true;return;}
    data.list.sources.push({id,recipeId:saved.id,title:saved.recipe.title,description:saved.description,baseServings:Number(saved.recipe.servings)||1,servings:Number(saved.recipe.servings)||1,ingredients:structuredClone(saved.recipe.ingredients),active:true});
  }
  function refreshList() {data.list.rows=buildShoppingRows(data.list.sources,data.list.rows);data.list.dirty=false;persist();renderShopping();}
  function openShopping(){navigate('more','shopping');renderShopping();}
  function renderShopping() {
    const list=data.list;
    shopping.innerHTML=`${button('← Back to More','back-more')}<p class="rw-kicker">More · Shopping</p><h1 tabindex="-1">Shopping List</h1><p>Choose saved recipes, review quantities, and follow any item back to its source.</p>${notice}
      <label for="rw-list-title">List name</label><input id="rw-list-title" maxlength="120" value="${e(list.title)}">
      <details><summary>Choose saved recipes (${data.recipes.length})</summary><p>Favorites are marked ★. Only checked recipes are included.</p>${data.recipes.map(r=>`<label class="rw-check"><input type="checkbox" data-include-recipe="${e(r.id)}" ${list.sources.some(s=>s.recipeId===r.id&&s.active!==false)?'checked':''}><span>${r.favorite?'★ ':''}${e(r.recipe.title)}</span></label>`).join('')||'<p>Generate and save a recipe first. Saved meal descriptions need a reviewed ingredient-level recipe before shopping quantities can be calculated.</p>'}${button('Apply recipe selection','apply-selection')}</details>
      <h2>Source meals and recipes</h2><p class="rw-note">These are editable copies for this list; editing them does not alter the original saved favorite. Description edits do not automatically invent ingredient changes. Edit the ingredient amounts too, then refresh.</p>
      <div class="rw-sources">${list.sources.map(s=>`<details id="rw-source-${e(s.id)}" data-source="${e(s.id)}"><summary>${e(s.title)}${s.active===false?' (not selected)':''}</summary><label>General description<textarea rows="3" data-source-field="description">${e(s.description)}</textarea></label><label>Servings to shop for<input type="number" min="0.25" max="100" step="0.25" data-source-field="servings" value="${e(s.servings)}"></label><label>Ingredients for ${e(s.baseServings)} original servings — one “amount | ingredient” per line<textarea rows="6" data-source-field="ingredients">${e(ingredientLines(s.ingredients))}</textarea></label></details>`).join('')||'<p>No recipes selected yet.</p>'}</div>
      <p class="rw-stale" ${list.dirty?'':'hidden'}>Source changes are pending. Refresh quantities before relying on this list.</p>${button('Refresh quantities — keep my edits','refresh-list')}
      <h2>Items to review</h2><p class="rw-note">Only enter confirmed on-hand amounts, in the unit shown. Leave unknown amounts blank. No ingredient is assumed to be in your pantry. Quantities with different units remain separate.</p>
      <div class="rw-items">${list.rows.map((r,i)=>`<article class="rw-item" data-row="${i}"><label class="rw-check"><input type="checkbox" data-row-field="checked" ${r.checked?'checked':''}><strong>${e(r.item)}</strong></label><p>Needed: ${r.needed===null?e(r.original || 'Unknown'):e(Number(r.needed.toFixed(3))+' '+r.unit)}</p><div class="rw-fields"><label>Confirmed on hand (${e(r.unit || 'same unit')})<input type="number" min="0" step="any" data-row-field="onHand" value="${e(r.onHand)}" ${r.needed===null?'disabled':''}></label><label>My purchase quantity / note<input maxlength="300" data-row-field="override" value="${e(r.override)}" placeholder="Optional override"></label></div><p class="rw-buy">To buy: <strong>${e(purchaseAmount(r))}</strong></p><p class="rw-source-links">From: ${(r.sourceIds || []).map(id=>{const s=list.sources.find(x=>x.id===id);return s?`<a href="#shopping-source=${encodeURIComponent(id)}">${e(s.title)}</a>`:'';}).join(' · ')||'Added manually'}</p>${r.review?'<p class="rw-stale">Source quantities changed; review your retained edits and checkmark.</p>':''}${r.retired?'<p class="rw-stale">No longer required by selected recipes. Kept for your review.</p>':''}<label class="rw-check"><input type="checkbox" data-row-field="excluded" ${r.excluded?'checked':''}><span>Exclude this item from exports</span></label>${r.review?button('Reviewed — keep this line','review-row',`data-index="${i}"`):''}${button(r.manual?'Delete item':'Exclude item','remove-row',`data-index="${i}"`)}</article>`).join('')||'<p>Your shopping list is empty.</p>'}</div>
      <div class="rw-actions">${button('Add an item','manual')}${button('Export Text (.txt)','shopping-text')}${button('Print / Save PDF','shopping-print')}</div><p class="rw-note">Text files can be edited in a text editor. PDF exports are print-ready copies; editing or annotating a PDF requires a PDF app. Edits to exported files do not sync back automatically.</p>
      <details><summary>Device storage</summary>${button('Clear this device’s recipe library and list','clear-local')}</details><p class="rw-status" role="status"></p>`;
  }
  function download(text,name) {
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function printDocument(title,body) {
    document.querySelector('#rw-print-root')?.remove();
    const paper=document.createElement('article');paper.id='rw-print-root';paper.innerHTML=`<h1>${e(title)}</h1>${body}`;document.body.append(paper);document.body.classList.add('rw-printing');
    const clean=()=>{document.body.classList.remove('rw-printing');paper.remove();};
    window.addEventListener('afterprint',clean,{once:true});
    try{window.print();}catch(error){clean();throw error;}
  }
  function printShopping() {
    const list=data.list;
    printDocument(list.title,`${list.dirty?'<p><strong>Source changes pending: refresh this list before relying on quantities.</strong></p>':''}<p>MealDaddy shopping checklist</p><ul>${list.rows.filter(r=>!r.excluded).map(r=>`<li><strong>${r.checked?'[x]':'[ ]'} ${e(r.item)}</strong> — ${e(purchaseAmount(r))}${r.review?' [REVIEW]':''}${r.retired?' [NO LONGER REQUIRED]':''}<br>From: ${(r.sourceIds||[]).map(id=>{const s=list.sources.find(x=>x.id===id);return s?`<a href="${e(sourceLink(location.href,id))}">${e(s.title)}</a>`:'';}).join(', ')||'Added manually'}</li>`).join('')}</ul><h2>Source meals and recipes</h2>${list.sources.map(s=>`<section><h3><a href="${e(sourceLink(location.href,s.id))}">${e(s.title)}</a></h3><p>${e(s.description)}</p><p>Servings: ${e(s.servings)}</p></section>`).join('')}<p>Source links require the same signed-in account and this device’s saved beta list. This exported copy does not sync edits back to MealDaddy.</p>`);
  }
  function openSourceFromHash() {
    const match=location.hash.match(/^#shopping-source=(.+)$/);if(!match)return;
    let id;try{id=decodeURIComponent(match[1]);}catch{return;}
    openShopping();
    const source=[...shopping.querySelectorAll('[data-source]')].find(node=>node.dataset.source===id);
    if(!source){status('This source is not available in this account’s saved list on this device. Refer to the exported description.');return;}
    source.open=true;source.scrollIntoView({block:'start'});source.querySelector('textarea')?.focus();
  }
  root.addEventListener('submit',event=>{
    if(event.target.id!=='rw-request')return;event.preventDefault();
    const description=q('#rw-description').value.trim();
    if(!description){status('Choose a favorite or describe the meal first.');return;}
    if(mode!=='restaurant'){review(description);return;}
    run(async()=>{status('Finding menu matches using Restaurant Mode…');const result=await call('coach-action',{mode:'restaurant',context:description,location:null,nutritionContext:nutritionContext()});renderChoices(result.restaurantPlan);status('Choose a match and review the substitutions.');});
  });
  root.addEventListener('change',event=>{
    if(event.target.id==='rw-favorite'){
      const selected=availableFavorites().find(f=>f.id===event.target.value);
      if(selected)q('#rw-description').value=selected.description;
      current=null;q('#rw-review').replaceChildren();q('#rw-result').replaceChildren();
      const saved=data.recipes.find(r=>`recipe:${r.id}`===event.target.value);
      if(saved){current=structuredClone(saved);review(saved.description);current=structuredClone(saved);renderRecipe();status('Opened your saved recipe without another AI request.');}
    }
  });
  root.addEventListener('input',event=>{
    if(event.target.closest('#rw-review') || event.target.id==='rw-description'){
      if(current){current=null;q('#rw-result').replaceChildren();status('Meal details changed. Confirm and regenerate the recipe before saving or shopping.');}
    }
  });
  root.addEventListener('click',event=>{
    const b=event.target.closest('[data-rw]');if(!b)return;
    const action=b.dataset.rw;
    if(action==='generate'){
      const description=q('#rw-confirm-description').value.trim();
      const changes=[...root.querySelectorAll('[data-substitution]:checked')].map(x=>x.value);
      const source=[description,changes.length?`Changes: ${changes.join('; ')}`:'',q('#rw-flavor').checked?'Include suitable herbs or sauce, quantities and preparation.':''].filter(Boolean).join('\n');
      if(description.length<3){status('Describe the meal before confirming.');return;}
      if(source.length>500){status(`This confirmed request is ${source.length} characters. Edit it to 500 or fewer; nothing has been sent or cut off.`);return;}
      run(async()=>{status('Generating your confirmed recipe…');const result=await call('recipe-recreation',{source,detailLevel:q('#rw-detail').value,searchCurrent:false});const r=result.recipePlan;
        if(!Array.isArray(r?.ingredients)||!r.ingredients.length||r.ingredients.some(i=>!i||typeof i.item!=='string'||!i.item.trim())||!Array.isArray(r.instructions)||!r.instructions.length||r.instructions.some(s=>typeof s!=='string'||!s.trim())||!Number.isFinite(Number(r.servings))||Number(r.servings)<=0)throw new Error('The recipe is incomplete. Your confirmed description is still available.');
        current={id:String(result.savedRecipeId||crypto.randomUUID()),description:source,recipe:r};renderRecipe();status('Recipe ready. Saving or planning it will not log it as eaten.');});return;
    }
    safeAction(()=>{
      if(action==='back-plan')navigate('plan','');
      if(action==='mode')changeMode(b.dataset.mode);
      if(action==='refresh-favorites')refreshFavorites();
      if(action==='choose'){const choice=menuChoices[Number(b.dataset.index)];review([choice.restaurant_name,choice.title,choice.order].filter(Boolean).join(' · '),choice.substitutions || []);}
      if(action==='change-choice'){q('#rw-review').replaceChildren();q('#rw-result').replaceChildren();q('#rw-choices').hidden=false;q('#rw-request').hidden=menuChoices.length>0;if(!menuChoices.length)q('#rw-description').focus();}
      if(action==='edit-search'){q('#rw-request').hidden=false;q('#rw-choices').hidden=true;}
      if(action==='start-over'){current=null;menuChoices=[];renderStart();}
      if(action==='edit-confirmed'){q('#rw-result').hidden=true;q('#rw-review').hidden=false;}
      if(action==='save'||action==='favorite'||action==='consider'){saveRecipe(action==='favorite');status(action==='favorite'?'Saved as a favorite in this device’s recipe library.':action==='consider'?'Saved to consider later; not added to shopping quantities.':'Recipe saved in this device’s recipe library.');}
      if(action==='add-shopping'){addSource(saveRecipe());data.list.dirty=true;refreshList();openShopping();}
      if(action==='not-now')status('No shopping-list change made. The recipe remains available on this page.');
      if(action==='recipe-text'&&current)download(recipeText(current.recipe),'MealDaddy-recipe.txt');
      if(action==='recipe-print'&&current)printDocument(current.recipe.title,`<pre>${e(recipeText(current.recipe))}</pre>`);
    });
  });
  shopping.addEventListener('input',event=>safeAction(()=>{
    const input=event.target;
    if(input.id==='rw-list-title'){data.list.title=input.value;persist();return;}
    const sourceEl=input.closest('[data-source]');
    if(sourceEl&&input.dataset.sourceField){const source=data.list.sources.find(s=>s.id===sourceEl.dataset.source);const field=input.dataset.sourceField;source[field]=field==='ingredients'?parseIngredients(input.value):field==='servings'?Number(input.value):input.value;data.list.dirty=true;shopping.querySelector('.rw-stale')?.removeAttribute('hidden');persist();return;}
    const rowEl=input.closest('[data-row]');
    if(rowEl&&input.dataset.rowField){const row=data.list.rows[Number(rowEl.dataset.row)];const field=input.dataset.rowField;
      if(field==='onHand'&&(input.value!==''&&(!Number.isFinite(Number(input.value))||Number(input.value)<0)))throw new Error('Enter a nonnegative on-hand quantity.');
      row[field]=input.type==='checkbox'?input.checked:input.value;rowEl.querySelector('.rw-buy strong').textContent=purchaseAmount(row);persist();}
  }));
  shopping.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#shopping-source="]');
    if(link){event.preventDefault();history.replaceState(null,'',link.getAttribute('href'));openSourceFromHash();return;}
    const b=event.target.closest('[data-rw]');if(!b)return;
    safeAction(()=>{
      const action=b.dataset.rw;
      if(action==='back-more')navigate('more','');
      if(action==='apply-selection'){
        data.list.sources.forEach(s=>s.active=false);
        for(const checkbox of shopping.querySelectorAll('[data-include-recipe]:checked')){const r=data.recipes.find(r=>r.id===checkbox.dataset.includeRecipe);if(r)addSource(r);}
        refreshList();
      }
      if(action==='refresh-list')refreshList();
      if(action==='manual'){const name=window.prompt('Item to add:');if(name?.trim()){data.list.rows.push({key:crypto.randomUUID(),item:name.trim().slice(0,300),needed:null,original:'',unit:'',sourceIds:[],onHand:'',override:'',manual:true,checked:false,excluded:false});persist();renderShopping();}}
      if(action==='remove-row'){const row=data.list.rows[Number(b.dataset.index)];if(row.manual){data.list.rows.splice(Number(b.dataset.index),1);}else row.excluded=true;persist();renderShopping();}
      if(action==='review-row'){data.list.rows[Number(b.dataset.index)].review=false;persist();renderShopping();}
      if(action==='shopping-text')download(shoppingText(data.list,location.href),'MealDaddy-shopping-list.txt');
      if(action==='shopping-print')printShopping();
      if(action==='clear-local'&&window.confirm('Remove this device’s recipe library and shopping list? Export a copy first. Existing account meals are not changed.')){localStorage.removeItem(key);data={recipes:[],list:{title:'Shopping list',sources:[],rows:[],dirty:false}};loadFailed=false;renderShopping();}
    });
  });
  document.querySelector('#recreate-favorite')?.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();openRecipes();},{capture:true});
  const more=document.querySelector('[aria-labelledby="more-tools-title"] .v1-launcher-list');
  if(more&&!more.querySelector('[data-rw-shopping-launch]')){const launch=document.createElement('button');launch.type='button';launch.dataset.rwShoppingLaunch='true';launch.innerHTML='<span aria-hidden="true">S</span><span><strong>Shopping List</strong><small>Saved recipes, source links, and editable exports</small></span>';launch.addEventListener('click',openShopping);more.prepend(launch);}
  window.addEventListener('hashchange',openSourceFromHash);
  document.querySelector('#sign-out')?.addEventListener('click',()=>{active=false;root.replaceChildren();shopping.replaceChildren();current=null;data={recipes:[],list:{title:'',sources:[],rows:[],dirty:false}};document.querySelector('#rw-print-root')?.remove();},{capture:true});
  openSourceFromHash();
}
