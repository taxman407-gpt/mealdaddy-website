import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { photoMetadata } from '../app/meal-photos.js';
import { reviewedPhotoDescription } from '../app/photo-review.js';

const source = readFileSync('app/app.js', 'utf8');
const marker = '$("#ledger-list").addEventListener("submit", async (event) => {';
const start = source.lastIndexOf(marker, source.indexOf('  const review = event.target.closest("[data-photo-review]");'));
const end = source.indexOf(marker, start + marker.length);
assert.ok(start >= 0 && end > start);

async function exercise({choice = 'correct', correction = 'Water, 8 oz', stale = false, failure = false, doubleSubmit = false} = {}) {
  const entry = {id: 'meal-1', kind: 'meal', status: 'estimated', description: '3 eggs; sweet tea', nutrition_estimate: {
    photo_path: 'owner/photo.jpg', photo_paths: ['owner/photo.jpg', 'owner/angle.jpg'], restaurant: 'Test restaurant', favorite_origin: {id: 'favorite-1', key: 'sync:favorite-1'},
    photo_review: [{name: 'Sweet tea', reason: 'Uncertain drink'}]
  }};
  const before = structuredClone(entry);
  const button = {disabled: false}; const status = {textContent: ''};
  const calls = []; const filters = []; let payload; let handler; let release;
  const gate = doubleSubmit ? new Promise(resolve => release = resolve) : Promise.resolve();
  const query = {
    update(value) { calls.push('update'); payload = value; return this; },
    eq(...args) { filters.push(args); return this; },
    select() { return this; },
    async maybeSingle() { await gate; return {data: stale || failure ? null : {id: entry.id}, error: failure ? {message: 'Save unavailable'} : null}; }
  };
  const form = {dataset: {photoReview: entry.id}, elements: {choice_0: {value: choice}, correction_0: {value: correction}}, querySelector: selector => selector.includes('button') ? button : status};
  const context = {
    $: () => ({addEventListener: (_, fn) => handler = fn}), entryById: () => entry,
    user: {id: 'owner'}, reviewedPhotoDescription, photoMetadata, crypto: {randomUUID: () => 'revision-1'},
    supabase: {from: table => {assert.equal(table, 'ledger_entries'); return query;}},
    mealDrafts: {remove: async key => {assert.equal(key, 'photo-review:meal-1'); calls.push('removeDraft');}},
    loadLedger: async () => calls.push('reload'),
    retryEstimateEntry: async id => {assert.equal(id, entry.id); calls.push('estimate');}
  };
  vm.runInNewContext(source.slice(start, end), context);
  const event = {preventDefault(){}, target: {closest: () => form}};
  const first = handler(event);
  if (doubleSubmit) { const second = handler(event); release(); await second; }
  await first;
  assert.deepEqual(entry, before, 'The in-memory original is not mutated');
  return {calls, filters, payload, status, button, before};
}

for (const choice of ['add', 'exclude', 'correct']) {
  const result = await exercise({choice});
  assert.deepEqual(result.calls, ['update', 'removeDraft', 'reload', 'estimate']);
  assert.equal(result.payload.description, choice === 'add' ? '3 eggs; sweet tea' : choice === 'exclude' ? '3 eggs' : '3 eggs; Water, 8 oz');
  assert.equal(result.payload.status, 'pending_estimate');
  assert.equal(result.payload.nutrition_estimate.input_authority, 'edited_text');
  assert.equal(result.payload.nutrition_estimate.photo_path, 'owner/photo.jpg');
  assert.deepEqual(result.payload.nutrition_estimate.photo_paths, ['owner/photo.jpg', 'owner/angle.jpg']);
  assert.equal(result.payload.nutrition_estimate.restaurant, 'Test restaurant');
  assert.deepEqual(result.payload.nutrition_estimate.favorite_origin, result.before.nutrition_estimate.favorite_origin);
  for (const [key, value] of [['id', 'meal-1'], ['user_id', 'owner'], ['description', result.before.description], ['status', 'estimated'], ['kind', 'meal'], ['nutrition_estimate', JSON.stringify(result.before.nutrition_estimate)]]) {
    assert.ok(result.filters.some(([k, v]) => k === key && v === value), `Missing concurrency filter: ${key}`);
  }
}
for (const options of [{stale: true}, {failure: true}]) {
  const result = await exercise(options);
  assert.deepEqual(result.calls, ['update'], 'Failed saves retain the draft and do not estimate');
  assert.ok(result.status.textContent); assert.equal(result.button.disabled, false);
}
for (const options of [{choice: ''}, {correction: ''}]) {
  const result = await exercise(options);
  assert.deepEqual(result.calls, []); assert.ok(result.status.textContent);
}
assert.deepEqual((await exercise({doubleSubmit: true})).calls, ['update', 'removeDraft', 'reload', 'estimate']);
console.log('Photo review save: same-row correction, retained favorite/photo, stale and failed saves, validation and duplicate submit passed.');
