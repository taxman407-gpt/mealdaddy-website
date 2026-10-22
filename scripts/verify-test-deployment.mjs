// Read-only acceptance check: success requires the test host to serve this build's actual files.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import config from '../test-environment.json' with { type: 'json' };
assert.equal(config.host, 'mealdaddy-october-test.taxman407.workers.dev');
assert.equal(config.projectRef, 'dkirmzthyynogkkaacmj');
const origin = `https://${config.host}`;
const hash = value => createHash('sha256').update(value).digest('hex');
const files = ['app/app.js', 'app/account.js', 'app/byok-vault.js', 'app/membership-policy.mjs', 'app/draft-navigation.js', 'app/meal-drafts.js', 'app/photo-review.js', 'app/test-lab.js'];
const expected = files.map(path => ({path, digest: hash(readFileSync(`dist-test/${path}`))}));
const deadline = Date.now() + (process.argv.includes('--wait') ? 180000 : 0);
let passed = false;
do {
  const healthResponse = await fetch(`${origin}/health`, {cache:'no-store', signal:AbortSignal.timeout(15000)});
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.projectRef, config.projectRef);
  assert.equal(health.productionConnected, false);
  assert.equal(health.ai, 'sample-fixtures-only');
  assert.equal(health.billing, 'disabled');
  const checks = await Promise.all(expected.map(async ({path,digest}) => {
    const response = await fetch(`${origin}/${path}`, {cache:'no-store', signal:AbortSignal.timeout(15000)});
    const actual = new Uint8Array(await response.arrayBuffer());
    return {path, matches:response.status === 200 && hash(actual) === digest};
  }));
  passed = checks.every(check => check.matches);
  console.log(JSON.stringify({health:'isolated fixture environment', files:checks, result:passed?'PASS':'STALE_OR_MISSING'}));
  if (passed || Date.now() >= deadline) break;
  await new Promise(resolve => setTimeout(resolve, 10000));
} while (true);
if (!passed) process.exitCode = 1;
