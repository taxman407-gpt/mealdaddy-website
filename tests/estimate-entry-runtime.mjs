import {sealByokCredentials, openByokCredentials} from "../supabase/functions/_shared/byok-cloud-vault.mjs";
import { lifetimeAccess } from "../supabase/functions/_shared/membership-policy.mjs";
import { validateByok, callByokProvider } from "../supabase/functions/_shared/byok-provider.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { gatePhotoComponents } from "../supabase/functions/_shared/photo-review.mjs";
import { applyComponentTotals } from "../supabase/functions/_shared/nutrition-reconciliation.mjs";
import * as contract from "../supabase/functions/_shared/estimate-edit-contract.mjs";

const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/estimate-entry/index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''), { mode: 'strip' });
const owner = '00000000-0000-4000-8000-000000000001';
const baseNutrients = Object.fromEntries(contract.nutrientFields.map((field) => [field, 0]));
function component(name, calories, extras = {}) { return { ...baseNutrients, name, calories, evidence_type: 'description_estimate', confidence: 'medium', inflammation_score: 3, inflammation_impact: 'neutral', inflammation_note: 'Test estimate.', ...extras }; }
function answer(components) { return { ...baseNutrients, components, entry_description: 'Synthetic meal', photo_quality: { suitable: true, reason: '' }, photo_description: '', description_reconciliation_note: '', label_detected: false, label_food: {}, inflammation_score: 3, inflammation_summary: 'Test estimate.', confidence: 'medium', note: 'Synthetic fixture.' }; }
async function exercise({ description = '1 oz vinaigrette', metadata = {}, kind = 'meal', status = 'pending_estimate', response = answer([component('1 oz vinaigrette', 45)]), stale = false, mfa = true, ownRow = true, body = {}, authorization = true, plan = "core", enableByok = false, hostedConfigured = true, cloudEnabled = false, cloudRecord = null, masterSecret = "" } = {}) {
  let handler;
  let providerCalls = 0, photoDownloads = 0, writes = 0, settlements = 0;
  let submitted;
  const row = { id: 'fixture-entry', user_id: ownRow ? owner : 'unrelated-member', description, kind, status, nutrition_estimate: structuredClone(metadata) };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function builder(table) {
    let patch = null;
    const filters = [];
    const q = {
      select() { return q; },
      update(value) { patch = value; return q; },
      eq(key, value) { filters.push([key, key === 'nutrition_estimate' ? JSON.parse(value) : value]); return q; },
      is(key, value) { filters.push([key, value]); return q; },
      gte() { return q; },
      then(resolve, reject) { return Promise.resolve(table === 'ai_usage_events' ? { data: [], error: null } : { data: null, error: null }).then(resolve, reject); },
      async maybeSingle() {
        if (table === 'byok_cloud_credentials') return {data:cloudRecord,error:null};
        if (table === 'subscriptions') return { data: { plan_key: plan, status: 'active' }, error: null };
        if (table === 'complimentary_access_grants') return { data: null, error: null };
        if (table !== 'ledger_entries') throw new Error('Unexpected table: ' + table);
        if (!filters.every(([key, value]) => same(row[key], value))) return { data: null, error: null };
        if (patch) { Object.assign(row, structuredClone(patch)); writes += 1; return { data: { id: row.id }, error: null }; }
        return { data: structuredClone(row), error: null };
      }
    };
    return q;
  }
  const client = {
    auth: { async getUser() { return { data: { user: { id: owner, email: 'synthetic@example.test' } }, error: null }; } },
    from: builder,
    storage: { from() { return { async download() { photoDownloads += 1; return { data: new Blob(['fixture'], { type: 'image/jpeg' }), error: null }; } }; } },
    async rpc(name) {
      if (name === 'reserve_ai_usage') return { data: [{ reservation_id: 'fixture-reservation' }], error: null };
      if (name === 'settle_ai_usage') settlements += 1;
      return { data: true, error: null };
    }
  };
  const context = {
    ...contract, applyComponentTotals, gatePhotoComponents, openByokCredentials, validateByok, callByokProvider, lifetimeAccess,
    createClient: () => client,
    requireConditionalMfa: async () => mfa ? { ok: true } : { ok: false, status: 403, error: 'MFA required.' },
    Deno: { env: { get(name) { if(name === 'ENABLE_BYOK_CLOUD') return cloudEnabled ? 'true' : 'false'; if(name === 'BYOK_VAULT_MASTER_KEY') return masterSecret; if(name === 'ENABLE_BYOK') return enableByok ? 'true' : 'false'; if(name === 'OPENAI_API_KEY' && !hostedConfigured) return undefined; return name === 'SUPABASE_URL' ? 'https://synthetic.example.test' : name === 'SUPABASE_PUBLISHABLE_KEYS' ? '{}' : 'test-value'; } }, serve(fn) { handler = fn; } },
    AbortSignal, crypto: webcrypto, TextEncoder, Uint8Array, Response, Request, Blob, URL, btoa, atob,
    fetch: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      providerCalls += 1;
      submitted = JSON.parse(options.body);
      if (stale) { row.description = 'A newer saved edit'; row.nutrition_estimate = { input_authority: 'edited_text', edit_revision: 'new-revision' }; }
      return new Response(JSON.stringify({ usage: { input_tokens: 100, output_tokens: 100 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(response) }] }] }), { status: 200 });
    }
  };
  context.callByokProvider = (credentials, request) => callByokProvider(credentials, request, context.fetch);
  vm.runInNewContext(source, context);
  const result = await handler(new Request('https://synthetic.example.test/estimate-entry', { method: 'POST', headers: authorization ? { authorization: 'Bearer synthetic-not-a-real-token', 'content-type': 'application/json' } : { 'content-type': 'application/json' }, body: JSON.stringify({ entryId: row.id, ...body }) }));
  return { status: result.status, payload: await result.json(), row, providerCalls, photoDownloads, writes, settlements, submitted };
}

let r = await exercise();
assert.equal(r.status, 200);
assert.equal(r.row.nutrition_estimate.calories, 45);
assert.equal(r.row.nutrition_estimate.components.length, 1);
assert.equal(r.photoDownloads, 0);
assert.match(r.submitted.input[1].content[0].text, /No image was supplied/);
assert.deepEqual(r.submitted.text.format.schema.components, undefined);
assert.deepEqual(r.submitted.text.format.schema.properties.components.items.properties.evidence_type.enum, ['description_estimate']);
assert.equal(r.row.description, '1 oz vinaigrette');

r = await exercise({ description: '50% salad with chicken, no dressing', metadata: { input_authority: 'edited_text', edit_revision: 'edit-2', photo_path: `${owner}/old-photo.jpg`, calories: 999, components: [component('OLD dressing', 999)] }, response: answer([component('Greens', 100), component('Chicken', 300, { protein_g: 50 })]), body: { itemizeExisting: true } });
assert.equal(r.status, 200);
assert.equal(r.row.nutrition_estimate.calories, 200);
assert.equal(r.row.nutrition_estimate.protein_g, 25);
assert.equal(r.row.nutrition_estimate.components.length, 2);
assert.equal(r.row.nutrition_estimate.edit_revision, 'edit-2');
assert.equal(r.photoDownloads, 0);
assert.ok(!JSON.stringify(r.submitted).includes('OLD dressing'));
assert.ok(!r.submitted.input[1].content[0].text.includes('50%'));
assert.equal(r.row.description, '50% salad with chicken, no dressing');

r = await exercise({ stale: true });
assert.equal(r.status, 409);
assert.equal(r.payload.code, 'ENTRY_CHANGED');
assert.equal(r.writes, 0);
assert.equal(r.row.description, 'A newer saved edit');
assert.equal(r.settlements, 1);

r = await exercise({ response: { ...answer([component('Invented salad', 100, { evidence_type: 'photo_estimate' })]), photo_description: 'Salad is visible.' } });
assert.equal(r.status, 502);
assert.equal(r.writes, 0);
assert.equal(r.row.status, 'pending_estimate');

r = await exercise({ status: 'estimated', metadata: { calories: 123, source: 'saved_food' } });
assert.equal(r.status, 200);
assert.equal(r.payload.alreadyEstimated, true);
assert.equal(r.payload.estimate.calories, 123);
assert.equal(r.providerCalls, 0);

r = await exercise({ description: 'Meal photo', metadata: { photo_path: `${owner}/photo.jpg` }, response: { ...answer([component('Visible meal', 400, { evidence_type: 'photo_estimate' })]), photo_description: 'A meal is visible.', entry_description: 'Visible meal' } });
assert.equal(r.status, 200);
assert.equal(r.photoDownloads, 1);
assert.equal(r.row.description, 'Meal photo');
assert.equal(r.row.nutrition_estimate.calories, 0);
assert.equal(r.row.nutrition_estimate.photo_review[0].name, 'Visible meal');
assert.equal(r.submitted.input[1].content[1].type, 'input_image');

r = await exercise({ description: '3 eggs', metadata: { photo_path: `${owner}/photo.jpg` }, response: { ...answer([component('3 eggs', 210, { confirmation_required: false }), component('Sweet tea', 180, { evidence_type: 'photo_estimate', confirmation_required: true })]), photo_description: 'Eggs and a possible drink.', entry_description: 'Eggs and sweet tea' } });
assert.equal(r.status, 200);
assert.equal(r.row.description, '3 eggs');
assert.equal(r.row.nutrition_estimate.calories, 210);
assert.equal(r.row.nutrition_estimate.photo_review[0].name, 'Sweet tea');
r = await exercise({ description: '3 eggs; Diet Dr Pepper, 2 oz', metadata: { input_authority: 'edited_text', edit_revision: 'reviewed', photo_path: `${owner}/photo.jpg` }, response: answer([component('3 eggs', 210), component('Diet Dr Pepper, 2 oz', 0)]) });
assert.equal(r.photoDownloads, 0);
assert.equal(r.row.nutrition_estimate.calories, 210);
assert.equal(r.row.description, '3 eggs; Diet Dr Pepper, 2 oz');

r = await exercise({ description: 'Meal photo', metadata: { photo_path: `${owner}/blurred.jpg` }, response: { ...answer([component('Unknown food', 400)]), photo_quality: { suitable: false, reason: 'Retake this blurred photo in brighter light.' } } });
assert.equal(r.status, 422);
assert.equal(r.payload.code, 'PHOTO_UNSUITABLE');
assert.equal(r.writes, 0);
assert.equal(r.settlements, 1);

r = await exercise({plan:'byo',enableByok:true,hostedConfigured:false,body:{byok:{provider:'openai',model:'explicit-test-model',key:'synthetic-key-no-secret'}}});
assert.equal(r.status,200);
assert.equal(r.row.nutrition_estimate.ai_provider,'openai');
assert.equal(r.row.nutrition_estimate.ai_model,'explicit-test-model');
assert.equal(r.row.nutrition_estimate.ai_billing,'user_provider_account');
assert(!JSON.stringify(r.row).includes('synthetic-key-no-secret'));
r = await exercise({plan:'byo',enableByok:true});
assert.equal(r.status,422);assert.equal(r.providerCalls,0);
r = await exercise({plan:'byo',enableByok:false,body:{byok:{provider:'openai',model:'explicit-test-model',key:'synthetic-key-no-secret'}}});
assert.equal(r.status,503);assert.equal(r.providerCalls,0);
r = await exercise({plan:'byo',enableByok:true,body:{byok:{provider:'best_value',model:'explicit-test-model',key:'synthetic-key-no-secret'}}});
assert.equal(r.status,400);assert.equal(r.providerCalls,0);

for (const config of [{ mfa: false }, { ownRow: false }, { authorization: false }]) {
  r = await exercise(config);
  assert.equal(r.status, !config.authorization && config.authorization !== undefined ? 401 : config.mfa === false ? 403 : 404);
  assert.equal(r.providerCalls, 0);
  assert.equal(r.writes, 0);
}
console.log('Estimator runtime: nine isolated replacement, image-evidence, portion, concurrency, idempotency, and security scenarios passed.');

const masterSecret = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const cloudRecord = await sealByokCredentials(owner, {provider:"openai",model:"synthetic-model",key:"synthetic-key-never-persist"}, masterSecret);
r = await exercise({plan:"byo",enableByok:true,cloudEnabled:true,cloudRecord,masterSecret,hostedConfigured:false,body:{byok:{storage:"cloud"}}});
assert.equal(r.status,200);
assert.equal(r.providerCalls,1);
assert.equal(r.submitted.model,"synthetic-model");
assert.ok(!JSON.stringify(r.row).includes("synthetic-key-never-persist"));
for (const options of [{cloudEnabled:false},{cloudRecord:null},{masterSecret:btoa("x".repeat(32))}]) {
 r = await exercise({plan:"byo",enableByok:true,cloudEnabled:true,cloudRecord,masterSecret,hostedConfigured:false,body:{byok:{storage:"cloud"}},...options});
 assert.ok([422,503].includes(r.status));
 assert.equal(r.providerCalls,0);
 assert.equal(r.writes,0);
}
console.log("Cloud estimator: selected encrypted key, missing/disabled/wrong-key rejection, no hosted fallback or key persistence passed.");
