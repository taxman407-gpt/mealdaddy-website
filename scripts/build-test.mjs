import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const config = JSON.parse(readFileSync('test-environment.json', 'utf8'));
if (config.projectRef !== 'dkirmzthyynogkkaacmj' || config.supabaseUrl !== `https://${config.projectRef}.supabase.co` || !config.publishableKey.startsWith('sb_publishable_')) throw new Error('Invalid isolated test configuration');
rmSync('dist-test', { recursive: true, force: true });
cpSync('dist', 'dist-test', { recursive: true });
const clientPath = 'dist-test/app/supabase-client.js';
let client = readFileSync(clientPath, 'utf8');
client = client.replace(/const SUPABASE_URL = "[^"]+";/, `const SUPABASE_URL = ${JSON.stringify(config.supabaseUrl)};`)
  .replace(/const SUPABASE_PUBLISHABLE_KEY = "[^"]+";/, `const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(config.publishableKey)};`)
  .replace('export async function invokeAuthenticated(functionName, options = {}) {', `export async function invokeAuthenticated(functionName, options = {}) {
  if (functionName !== 'estimate-entry' && functionName !== 'owner-access-status' && functionName !== 'manage-referrals' && functionName !== 'manage-byok' && functionName !== 'owner-conversion-report') {
    return { data: null, error: new Error('This feature is not connected in the isolated test environment. No payment or live AI request was made.') };
  }`);
writeFileSync(clientPath, client);
cpSync('app/october-test-controls.js', 'dist-test/app/october-test-controls.js');
cpSync('app/october-test.css', 'dist-test/app/october-test.css');
for (const file of ['test-lab.html', 'test-lab.js', 'test-lab.css']) cpSync(`app/${file}`, `dist-test/app/${file}`);
let fixtures = readFileSync('supabase/test-functions/estimate-entry/fixtures.mjs', 'utf8').replace('../../functions/_shared/estimate-edit-contract.mjs', './test-estimate-contract.mjs').replace('../../functions/_shared/nutrition-reconciliation.mjs', './test-nutrition-reconciliation.mjs');
writeFileSync('dist-test/app/test-fixtures.mjs', fixtures);
cpSync('supabase/functions/_shared/estimate-edit-contract.mjs', 'dist-test/app/test-estimate-contract.mjs');
cpSync('supabase/functions/_shared/nutrition-reconciliation.mjs', 'dist-test/app/test-nutrition-reconciliation.mjs');
writeFileSync('dist-test/app/register-sw.js', '// Service worker disabled for isolated testing.\n');
writeFileSync('dist-test/app/service-worker.js', "self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', event => event.waitUntil(self.registration.unregister()));\n");
function prepare(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) { prepare(path); continue; }
    if (!/\.(html|js|mjs|css|json|webmanifest)$/.test(path)) continue;
    let text = readFileSync(path, 'utf8');
    if (item.name.endsWith('.html')) {
      text = text.replace('</head>', '<link rel="stylesheet" href="/app/october-test.css"><script type="module" src="/app/october-test-controls.js"></script></head>');
      writeFileSync(path, text);
    }
    if (text.includes('egbieqvbwniaxgqjzqkp') || text.includes('sb_publishable_fvCS-') || /\bsb_secret_/.test(text)) throw new Error(`Production endpoint or secret found in ${path}`);
  }
}
prepare('dist-test');
writeFileSync('dist-test/test-build.json', JSON.stringify({ environment: config.environment, projectRef: config.projectRef, ai: 'sample-fixtures-only', billing: 'disabled' }));
console.log('Prepared isolated test bundle in dist-test/; production endpoint scan passed.');
