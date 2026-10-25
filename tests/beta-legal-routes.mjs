import assert from 'node:assert/strict';
import worker from '../worker.beta.js';
let assetCalls=0;
const env={ASSETS:{fetch:async request=>{assetCalls++;const path=new URL(request.url).pathname;return path.endsWith('.html')?Response.redirect(new URL(path.slice(0,-5),request.url),307):new Response('Legal document',{status:200});}}};
const origin='https://mealdaddy-october-test.taxman407.workers.dev';
for(const page of ['terms','privacy','health-disclaimer']) {
 const first=await worker.fetch(new Request(`${origin}/${page}.html`),env);assert.equal(first.status,307);
 const target=first.headers.get('location');const canonical=await worker.fetch(new Request(target),env);assert.equal(canonical.status,200);assert.equal(await canonical.text(),'Legal document');assert.equal(canonical.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
 const trailing=await worker.fetch(new Request(`${origin}/${page}/`),env);assert.equal(trailing.status,200);
}
const previous=assetCalls;
for(const path of ['/terms.js','/terms-secret','/privacy.json','/supabase/config.toml','/.env','/docs/private.md'])assert.equal((await worker.fetch(new Request(origin+path),env)).status,404);
assert.equal(assetCalls,previous,'Disallowed paths never reach asset storage');
assert.equal((await worker.fetch(new Request('https://www.mealdaddy.ai/terms'),env)).status,421);
console.log('Beta legal routes: extensionless/trailing-slash redirects work; unrelated and private paths remain blocked.');
