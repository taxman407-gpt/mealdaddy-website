import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const auth = read("app/auth.js");
const appHtml = read("app/app.html");
const client = read("app/supabase-client.js");
const worker = read("worker.js");
const migration = read("supabase/migrations/20260812210000_ai_usage_hard_limits.sql");
const checkout = read("supabase/functions/create-checkout/index.ts");
const deletion = read("supabase/functions/delete-account/index.ts");

assert.match(client, /\.\/vendor\/supabase-js\.js/);
assert.doesNotMatch(client, /cdn\.jsdelivr|esm\.sh/);
assert.doesNotMatch(appHtml, /\son[a-z]+=/i);
assert.match(auth, /destination\.origin !== location\.origin/);
assert.match(worker, /Content-Security-Policy/);
assert.match(worker, /frame-ancestors 'none'/);
assert.match(migration, /reserve_ai_usage/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /AI_REQUEST_IN_PROGRESS/);
assert.match(checkout, /existingMembership/);
assert.match(checkout, /idempotencyKey/);
assert.match(deletion, /signInWithPassword/);
console.log("Security-hardening checks passed.");
