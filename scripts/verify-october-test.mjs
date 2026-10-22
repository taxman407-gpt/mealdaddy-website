// Run only with temporary synthetic identities, never real member credentials.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import config from '../test-environment.json' with { type: 'json' };
const identities = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(config.projectRef, 'dkirmzthyynogkkaacmj');
assert(identities.every(account => account.email.endsWith('@example.invalid')));
async function call(path, token, method = 'GET', body) {
  const response = await fetch(`${config.supabaseUrl}${path}`, { method, headers: { apikey: config.publishableKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type':'application/json', Prefer:'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const tokens = [];
try {
  for (const account of identities) {
    const login = await call('/auth/v1/token?grant_type=password', null, 'POST', { email: account.email, password: account.password });
    assert.equal(login.status, 200, `Synthetic authentication returned ${login.status}`);
    assert.equal(typeof login.data.access_token, 'string');
    tokens.push(login.data.access_token);
  }
  const [a,b] = tokens;
  const occurred_at = new Date().toISOString();
  const inserted = await call('/rest/v1/ledger_entries', a, 'POST', { user_id:identities[0].id, client_request_id:crypto.randomUUID(), kind:'meal', meal_label:'Lunch', description:'Test pizza', occurred_at });
  assert.equal(inserted.status, 201, 'Own meal insert');
  const id = inserted.data[0].id;
  const before = await call(`/rest/v1/ledger_entries?id=eq.${id}`, b);
  assert.deepEqual(before.data, [], 'Other account cannot read the meal');
  const foreignEstimate = await call('/functions/v1/estimate-entry', b, 'POST', { entryId:id });
  assert.equal(foreignEstimate.status, 404, 'Other account cannot estimate the meal');
  let estimate = await call('/functions/v1/estimate-entry', a, 'POST', { entryId:id });
  assert.equal(estimate.status, 200, `Fixture estimate returned ${estimate.status}: ${JSON.stringify(estimate.data)}`);
  assert.equal(estimate.data.estimate.calories, 1000);
  const edit = await call(`/rest/v1/ledger_entries?id=eq.${id}`, a, 'PATCH', { description:'50% Test pizza', nutrition_estimate:{input_authority:'edited_text'},status:'pending_estimate' });
  assert.equal(edit.status, 200);
  estimate = await call('/functions/v1/estimate-entry', a, 'POST', { entryId:id });
  assert.equal(estimate.status, 200);
  assert.equal(estimate.data.estimate.calories, 500);
  assert.equal(estimate.data.estimate.carbs_g, 40);
  assert.equal(estimate.data.estimate.fiber_g, 10);
  assert.equal(estimate.data.estimate.net_carbs_g, 30);
  const entries = await call('/rest/v1/ledger_entries', a);
  assert.equal(entries.data.length, 1);
  assert.equal(entries.data[0].occurred_at, inserted.data[0].occurred_at, 'Original timestamp preserved');
  await call(`/rest/v1/ledger_entries?id=eq.${id}`, a, 'PATCH', { description:'Test salad without dressing', nutrition_estimate:{input_authority:'edited_text'},status:'pending_estimate' });
  estimate = await call('/functions/v1/estimate-entry', a, 'POST', { entryId:id });
  assert.equal(estimate.status, 200);
  assert.equal(estimate.data.estimate.components.length, 2);
  assert.equal(estimate.data.estimate.calories, 240);
  assert(!estimate.data.estimate.components.some(component => /dressing|vinaigrette/i.test(component.name)));
  const owner = await call('/functions/v1/owner-access-status', a, 'POST', {});
  assert.equal(owner.status, 200);
  assert.equal(owner.data.isOwner, false);
  const unauth = await call('/functions/v1/estimate-entry', null, 'POST', { entryId:id });
  assert.equal(unauth.status, 401);
  console.log('PASS: real test Auth, REST insert, cross-account read and function denial, full/half fixture calculation, edit replacement, unchanged timestamp, single row, removed dressing, owner denial, unauthenticated rejection.');
} finally {
  for (const token of tokens) await call('/auth/v1/logout?scope=global', token, 'POST').catch(() => {});
}
