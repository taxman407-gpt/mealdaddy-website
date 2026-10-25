// Read-only checks of public beta assets; never accesses accounts or records.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const origin = 'https://mealdaddy-october-test.taxman407.workers.dev';
const hash = value => createHash('sha256').update(value).digest('hex');
const files = ['auth.js', 'auth.html', 'supabase-client.js', 'app.js', 'app.html', 'saved-foods.js', 'styles.css',
  'beta-connection.js', 'beta-controls.js', 'beta-admin.js', 'byok-vault.js',
  'ai-usage.html', 'ai-usage.js', 'meal-photos.js', 'entry-reliability.js', 'feedback-insights.html', 'meal-drafts.js', 'draft-navigation.js', 'photo-review.js', 'meal-portion.js', 'welcome-email.html', 'welcome-email.js', 'welcome-email.css'];
const get = path => fetch(`${origin}/${path}`, {
  cache: 'no-store', signal: AbortSignal.timeout(15000)
});
const healthResponse = await get('health');
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.environment, 'private-beta');
assert.equal(health.accounts, 'shared');
assert.equal(health.billing, 'disabled');
assert.equal(health.apiNamespace, 'beta-');
const checks = await Promise.all(files.map(async file => {
  const expected = hash(readFileSync(`dist-beta/app/${file}`));
  const response = await get(`app/${file}`);
  const actual = hash(new Uint8Array(await response.arrayBuffer()));
  return {file, matches: response.status === 200 && actual === expected};
}));
console.log(JSON.stringify({health, checks}, null, 2));
assert.ok(checks.every(check => check.matches), 'Beta assets differ from local build');
console.log('PASS: deployed beta assets match. Authenticated and provider acceptance remain separate.');
