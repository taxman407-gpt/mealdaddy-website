import {appendPantryPhotos, mergeInterpretation, confirmedInventory, useTemporaryPantryPhotos, MAX_PANTRY_PHOTOS} from './pantry-review-core.mjs';
import {escapeHtml as e} from './recipe-workflow-core.mjs';
import {guardPlanningBack} from './planning-view-history.mjs';

// Beta-only: all network/storage operations are injected; confirmed data never creates a meal log.
export function initializePantryReview({userId, invoke, failure, storage, prepareImage, navigate, nutritionContext, drafts, checkConnection}) {
  const dashboard = document.querySelector('.dashboard');
  if (!dashboard || !userId) return null;
  const root = document.createElement('section'); root.id = 'pantry-review'; root.className = 'pantry-panel'; dashboard.append(root);
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = new URL('./pantry-review.css', import.meta.url).href; document.head.append(style);
  const q = selector => root.querySelector(selector);
  let state = {photos: [], rows: [], written: '', preferences: '', analyzed: false, stale: false, confirmed: false, editing: false, guidance: '', cleanupPaths: []};
  let active = true, busy = false, urls = [], saveTimer = null, restoring = true, cleanupIssue = false;
  const key = 'pantry-review-v1';
  let revision = 0;
  function note(text, alert = false) {
    if (!active) return;
    q('#pantry-status').textContent = text; q('#pantry-status').dataset.error = String(alert);
  }
  function save() {
    if (restoring || !active) return Promise.resolve();
    clearTimeout(saveTimer);
    return Promise.resolve(drafts.save(key, {...state})).catch(error => {
      if (active) q('#pantry-draft-status').textContent = error?.message || 'The draft could not be saved on this device. Keep this page open.';
    });
  }
  function changed({interpretation = false} = {}) {
    revision++;
    state.confirmed = false; state.guidance = '';
    if (interpretation && state.analyzed) state.stale = true;
    q('#pantry-result').hidden = true;
    q('#pantry-generate').disabled = true;
    q('#pantry-confirmed').hidden = true;
    q('#pantry-stale').hidden = !state.stale;
    q('#pantry-confirm').disabled = state.stale || busy;
    clearTimeout(saveTimer); saveTimer = setTimeout(save, 300);
  }
  function renderPhotos() {
    urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
    const list = q('#pantry-photos'); list.replaceChildren();
    state.photos.forEach((file, index) => {
      const url = URL.createObjectURL(file); urls.push(url);
      const li = document.createElement('li');
      const img = document.createElement('img'); img.src = url; img.alt = `Food photo ${index + 1}: ${file.name || 'camera photo'}`;
      const label = document.createElement('span'); label.textContent = `Photo ${index + 1}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.removePantryPhoto = String(index); remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove photo ${index + 1}`);
      li.append(img, label, remove); list.append(li);
    });
    q('#pantry-photo-count').textContent = `${state.photos.length} of ${MAX_PANTRY_PHOTOS} photos selected. Additional photos are added, not replacements.`;
  }
  function renderReview() {
    const panel = q('#pantry-interpretation'); panel.hidden = !state.analyzed;
    q('#pantry-stale').hidden = !state.stale;
    q('#pantry-rows').innerHTML = state.rows.map(row => `<article class="pantry-row" data-pantry-row="${e(row.id)}">
      <label class="pantry-include"><input type="checkbox" data-row-field="included" ${row.included ? 'checked' : ''} ${state.editing ? '' : 'disabled'}><span>Include this food${row.uncertain ? ' — identification needs checking' : ''}</span></label>
      <div class="pantry-fields"><label>Food<input maxlength="160" data-row-field="name" value="${e(row.name)}" ${state.editing ? '' : 'readonly'}></label><label>Quantity / unit (leave blank if unknown)<input maxlength="100" data-row-field="quantity" value="${e(row.quantity)}" placeholder="Unknown — check before shopping" ${state.editing ? '' : 'readonly'}></label></div>
      ${row.note ? `<p class="pantry-note">${e(row.note)}</p>` : ''}${row.photoNumbers?.length ? `<p class="pantry-note">Seen in photo ${e(row.photoNumbers.join(', '))}</p>` : ''}
      ${row.uncertain ? '<p class="pantry-uncertain">Not selected automatically. Use Edit Interpretation to correct or explicitly include it.</p>' : ''}
      ${row.edited ? '<p class="pantry-note">Your correction is retained.</p>' : ''}</article>`).join('') || '<p>No foods were confidently identified. Edit the interpretation to add your foods.</p>';
    q('#pantry-add-item').hidden = !state.editing;
    q('#pantry-confirm').textContent = state.editing ? 'Save Corrections & Confirm' : 'Yes, That’s Correct';
    q('#pantry-confirm').disabled = state.stale || busy;
    q('#pantry-confirmed').hidden = !state.confirmed;
    q('#pantry-generate').disabled = !state.confirmed || state.stale || busy;
    q('#pantry-result').hidden = !state.guidance;
    q('#pantry-guidance').textContent = state.guidance;
    q('[data-pantry="cleanup"]').hidden = !state.cleanupPaths?.length;
  }
  function render() {
    root.innerHTML = `<button type="button" data-pantry="back">← Back to Plan</button><p class="pantry-kicker">Plan from my kitchen</p><h1 tabindex="-1">What do you have on hand?</h1><p>Show your foods, check the interpretation, then plan a meal.</p>
      <fieldset id="pantry-input"><legend>1. Add photos or describe your foods</legend>
        <div class="pantry-actions"><button type="button" data-pantry="camera">Take Photo</button><button type="button" data-pantry="gallery">Choose Photos</button></div>
        <input id="pantry-camera" type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" hidden>
        <input id="pantry-gallery" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>
        <p id="pantry-photo-count" class="pantry-note"></p><ul id="pantry-photos" aria-label="Selected food photos"></ul>
        <label for="pantry-written">Foods available or photo corrections</label><textarea id="pantry-written" rows="3" maxlength="1600" placeholder="Example: The container is Greek yogurt, not sour cream. I also have two eggs.">${e(state.written)}</textarea>
        <label for="pantry-preferences">Meal preferences (optional)</label><textarea id="pantry-preferences" rows="2" maxlength="1000" placeholder="Example: Cooking for two, about 30 minutes, with a lemon-herb sauce.">${e(state.preferences)}</textarea>
        <p class="pantry-note">Up to 6 photos, 8 MB each and 24 MB total. Temporary analysis uploads are removed after the request. Unfinished photos and corrections are kept in your device draft.</p>
        <div class="pantry-actions"><button type="button" data-pantry="interpret">Review food interpretation</button><button type="button" data-pantry="manual">Enter foods myself</button></div>
      </fieldset>
      <section id="pantry-interpretation" hidden><h2>2. Did I interpret your photos correctly?</h2><p>Check names and quantities. Exclude mistakes and add anything missed. A visible package does not mean the full amount is available.</p>
        <p id="pantry-stale" class="pantry-warning" hidden>Photos or written food details changed. Review the interpretation again before confirming. Your earlier corrections are kept.</p>
        <div id="pantry-rows"></div><div class="pantry-actions"><button type="button" data-pantry="edit">Edit Interpretation</button><button type="button" id="pantry-add-item" data-pantry="add" hidden>Add Item</button><button type="button" id="pantry-confirm" data-pantry="confirm">Yes, That’s Correct</button></div>
        <p id="pantry-confirmed" class="pantry-confirmed" hidden>Confirmed. Only your included foods and corrected quantities will be used. Unknown quantities remain unknown.</p>
        <h2>3. Plan from the confirmed list</h2><button type="button" id="pantry-generate" data-pantry="generate" disabled>Generate my meal plan</button>
      </section><section id="pantry-result" hidden><h2>Your meal plan</h2><div id="pantry-guidance"></div></section>
      <p id="pantry-status" role="status" aria-live="polite"></p><button type="button" data-pantry="cleanup" hidden>Retry temporary photo cleanup</button><p id="pantry-draft-status" class="pantry-note">Unfinished work is saved on this device only. Nothing here is logged as eaten.</p><button type="button" data-pantry="clear">Clear this kitchen draft</button>`;
    renderPhotos(); renderReview();
  }
  render();
  const ready = Promise.resolve(drafts.read(key)).then(draft => {
    if (!active || !draft) return;
    if (Array.isArray(draft.rows) && draft.rows.length <= 60) {
      if (draft.rows.some(row => !row || typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.quantity !== 'string')) throw new Error('Invalid draft rows');
      if (!Array.isArray(draft.photos || [])) throw new Error('Invalid draft photos');
      state = {...state, ...draft, photos: (draft.photos || []).filter(photo => photo instanceof Blob),
        written: String(draft.written || '').slice(0,1600), preferences: String(draft.preferences || '').slice(0,1000)};
      // A restored approval is never reused without showing the review again.
      state.confirmed = false;
      state.cleanupPaths = (Array.isArray(state.cleanupPaths) ? state.cleanupPaths : []).filter(path => typeof path === 'string' && path.startsWith(`${userId}/pantry-scan-`) && /^[a-f0-9-]{36}\.jpg$/i.test(path.slice(`${userId}/pantry-scan-`.length)));
      if ((draft.photoIdentities?.length || 0) > state.photos.length) {state.stale = true; state.guidance = '';}
      render();
      note(state.stale ? 'Some draft photos could not be restored. Add them again or enter your foods; your corrections are kept.' : 'Your unfinished kitchen draft was restored. Review and confirm it before continuing.');
    }
  }).catch(() => note('The previous kitchen draft could not be read. No existing meal or recipe was changed.', true)).finally(() => {restoring = false;});
  const backGuard = guardPlanningBack({subview: 'pantry', parentView: 'plan', navigate, save});
  async function call(body) {
    const result = await invoke('pantry-review', {body});
    if (result.error || result.data?.ok !== true) {
      const detail = result.error ? await failure(result.error) : null;
      throw new Error(detail?.message || result.data?.error || 'This beta photo-review service is not ready. Your draft has been kept.');
    }
    return result.data;
  }
  async function run(task) {
    if (busy || restoring || !active) return;
    busy = true;
    root.querySelectorAll('button,input,textarea').forEach(control => {control.dataset.wasDisabled = String(control.disabled); control.disabled = true;});
    q('[data-pantry="back"]').disabled = false;
    try {
      const error = await checkConnection?.();
      if (error) throw error;
      await task();
    } catch (error) { note(error?.message || 'This request did not finish. Your draft is kept.', true); }
    finally {
      busy = false;
      if (active) {
        root.querySelectorAll('button,input,textarea').forEach(control => {control.disabled = control.dataset.wasDisabled === 'true'; delete control.dataset.wasDisabled;});
        renderReview(); await save();
        if (cleanupIssue) {q('#pantry-draft-status').textContent = 'Temporary photo removal could not be confirmed. Your draft remains available; retry cleanup before clearing this device.';}
      }
    }
  }
  root.addEventListener('change', async event => {
    if (busy || restoring) return;
    if (['pantry-camera', 'pantry-gallery'].includes(event.target.id)) {
      const selected = [...event.target.files]; event.target.value = '';
      if (!selected.length) return; // Cancel does not erase any existing selection.
      try {state.photos = appendPantryPhotos(state.photos, selected); changed({interpretation: true}); renderPhotos(); renderReview(); await save(); note('Photos added. Review their interpretation before planning.');}
      catch (error) {note(error.message, true);}
    }
  });
  root.addEventListener('input', event => {
    if (busy || restoring) return;
    if (event.target.id === 'pantry-written') {state.written = event.target.value; changed({interpretation: true});}
    if (event.target.id === 'pantry-preferences') {state.preferences = event.target.value; changed();}
    const rowNode = event.target.closest('[data-pantry-row]');
    if (rowNode && state.editing) {
      const row = state.rows.find(item => item.id === rowNode.dataset.pantryRow), field = event.target.dataset.rowField;
      if (row && ['name', 'quantity', 'included'].includes(field)) {row[field] = field === 'included' ? event.target.checked : event.target.value; row.edited = true; changed();}
    }
  });
  root.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-pantry-photo]');
    if (remove && !busy) {state.photos.splice(Number(remove.dataset.removePantryPhoto), 1); changed({interpretation: true}); renderPhotos(); renderReview(); void save(); return;}
    const button = event.target.closest('[data-pantry]'); if (!button) return;
    const action = button.dataset.pantry;
    if (action === 'back') {void save(); navigate('plan', ''); return;}
    if (busy || restoring) return;
    if (action === 'camera') q('#pantry-camera').click();
    if (action === 'gallery') q('#pantry-gallery').click();
    if (action === 'edit') {state.editing = true; changed(); renderReview(); q('#pantry-rows input[data-row-field="name"]')?.focus();}
    if (action === 'add' || action === 'manual') {
      state.analyzed = true; state.editing = true;
      if (action === 'manual') state.stale = false;
      if (state.rows.length >= 60) {note('Use up to 60 foods in one review.', true); return;}
      state.rows.push({id: crypto.randomUUID(), name: '', originalName: '', quantity: '', included: true, uncertain: false, edited: true, note: '', photoNumbers: []});
      changed(); renderReview(); q('#pantry-rows article:last-child input[data-row-field="name"]')?.focus();
    }
    if (action === 'confirm') {
      try {
        if (state.stale) throw new Error('Review the changed photos or description first.');
        confirmedInventory(state.rows); state.confirmed = true; state.editing = false; renderReview(); void save();
        note('Interpretation confirmed. Select Generate my meal plan when you are ready.');
      } catch (error) {note(error.message, true);}
    }
    if (action === 'interpret') {
      if (!state.photos.length && !state.written.trim()) {note('Add a photo, describe your foods, or choose Enter foods myself.', true); return;}
      const version = revision;
      void run(async () => {
        cleanupIssue = false; note('Identifying foods for your review. No recipe is being generated yet.');
        const result = await useTemporaryPantryPhotos(state.photos, {userId, storage, prepare: prepareImage,
          onCleanupIssue: paths => {cleanupIssue = true; state.cleanupPaths = [...new Set([...(state.cleanupPaths || []), ...paths])];}, invoke: photoPaths => call({action: 'interpret', photoPaths, description: state.written})});
        if (!active || revision !== version) return;
        state.rows = mergeInterpretation(state.rows, result.items); state.analyzed = true; state.stale = false; state.confirmed = false; state.editing = false; state.guidance = '';
        note('Did I interpret your photos correctly? Check the list, then confirm or edit.');
        q('#pantry-interpretation').hidden = false; q('#pantry-interpretation').scrollIntoView({block: 'start'});
      });
    }
    if (action === 'generate') {
      if (!state.confirmed || state.stale) {note('Confirm the food interpretation first.', true); return;}
      let items; try {items = confirmedInventory(state.rows);} catch (error) {note(error.message, true); return;}
      const version = revision;
      void run(async () => {
        note('Planning from your confirmed foods and quantities…');
        const result = await call({action: 'plan', confirmed: true, items, preferences: state.preferences, nutritionContext: nutritionContext()});
        if (!active || revision !== version) return;
        if (typeof result.guidance !== 'string' || !result.guidance.trim()) throw new Error('The plan was incomplete. Your confirmed list is kept.');
        state.guidance = result.guidance; note('Meal plan ready. Planning has not added anything to your meal log.');
      });
    }
    if (action === 'clear' && state.cleanupPaths?.length) {note('Retry temporary photo cleanup before clearing this draft.', true); return;}
    if (action === 'cleanup') {
      busy = true; button.disabled = true;
      Promise.resolve().then(() => storage.remove(state.cleanupPaths)).then(({error}) => {
        if (error) throw error;
        state.cleanupPaths = []; cleanupIssue = false; q('#pantry-draft-status').textContent = 'Temporary photo removal confirmed. Your device draft is unchanged.'; note('Temporary photo cleanup finished.');
      }).catch(() => note('Temporary photo removal is still pending. Reconnect and try this cleanup again; no AI request is made.', true))
        .finally(() => {busy = false; button.disabled = false; renderReview(); void save();});
    }
    if (action === 'clear' && window.confirm('Clear this device’s unfinished kitchen draft? Saved meals and recipes will not change.')) {
      void Promise.resolve().then(() => drafts.remove(key)).then(() => {state = {photos: [], rows: [], written: '', preferences: '', analyzed: false, stale: false, confirmed: false, editing: false, guidance: '', cleanupPaths: []}; render();}).catch(() => note('The draft could not be cleared. Your existing work has been kept.', true));
    }
  });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {if (document.visibilityState === 'hidden') void save();});
  document.querySelector('#sign-out')?.addEventListener('click', () => {void save(); active = false; clearTimeout(saveTimer); backGuard.dispose(); urls.forEach(url => URL.revokeObjectURL(url)); root.replaceChildren(); state.photos = []; state.rows = [];}, {capture: true});
  return {async open(preferences = '') {await ready; if (!active) return; if (preferences) {state.preferences = preferences.slice(0, 1000); q('#pantry-preferences').value = state.preferences; changed();} navigate('plan', 'pantry'); q('h1').focus({preventScroll: true});}};
}
