import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import test from 'node:test';
import worker from '../worker.test.js';
import config from '../test-environment.json' with { type: 'json' };
const testConfig = JSON.parse(readFileSync('wrangler.test.jsonc', 'utf8'));
const productionConfig = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const request = (path, method = 'GET', host = config.host) => new Request(`https://${host}${path}`, { method });

test('test Worker and asset output are distinct from production', () => {
  assert.equal(testConfig.name, 'mealdaddy-october-test');
  assert.equal(testConfig.main, './worker.test.js');
  assert.equal(testConfig.assets.directory, './dist-test');
  assert.notEqual(testConfig.assets.directory, productionConfig.assets.directory);
  assert.equal(testConfig.routes, undefined);
  assert.equal(testConfig.route, undefined);
  assert.equal(productionConfig.name, 'mealdaddy-website');
  assert.equal(productionConfig.workers_dev, false);
});

test('test host redirects locally and reports test-only readiness', async () => {
  const response = await worker.fetch(request('/'));
  assert.equal(new URL(response.headers.get('location')).host, config.host);
  const health = await (await worker.fetch(request('/health'))).json();
  assert.equal(health.productionConnected, false);
  assert.equal(health.billing, 'disabled');
  assert.equal(health.ai, 'sample-fixtures-only');
  assert.equal((await worker.fetch(request('/', 'GET', 'www.mealdaddy.ai'))).status, 421);
});

test('private files and missing assets fail closed', async () => {
  for (const path of ['/docs/a.md','/test-environment.json','/supabase/config.toml','/.git/config','/app/app.js.map']) assert.equal((await worker.fetch(request(path))).status, 404);
  assert.equal((await worker.fetch(request('/app/auth.html'))).status, 503);
  assert.equal((await worker.fetch(request('/app/auth.html', 'POST'))).status, 405);
});

test('served test responses restrict network access to the test project', async () => {
  const response = await worker.fetch(request('/app/auth.html'), { ASSETS: { fetch: async () => new Response('test assets') } });
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /dkirmzthyynogkkaacmj/);
  assert.doesNotMatch(csp, /egbieqvbwniaxgqjzqkp|stripe\.com|openai\.com/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
});

test('generated bundle contains no production API endpoint or secret', () => {
  if (!existsSync('dist-test')) return; // CI performs the full build before this test.
  function scan(path) {
    for (const file of readdirSync(path, { withFileTypes: true })) {
      const name = `${path}/${file.name}`;
      if (file.isDirectory()) { scan(name); continue; }
      if (!/\.(js|html|json|css|webmanifest)$/.test(name)) continue;
      assert.doesNotMatch(readFileSync(name, 'utf8'), /egbieqvbwniaxgqjzqkp|sb_publishable_fvCS-|\bsb_secret_/);
    }
  }
  scan('dist-test');
  assert.match(readFileSync('dist-test/app/supabase-client.js','utf8'), /dkirmzthyynogkkaacmj/);
  assert.match(readFileSync('dist-test/app/auth.html','utf8'), /october-test-controls/);
  assert.doesNotMatch(readFileSync('dist/app/auth.html','utf8'), /october-test-controls/);
  assert.equal(existsSync('dist/app/october-test-controls.js'), false);
});
