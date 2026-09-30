import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, script, setupScript, migration] = await Promise.all([
  readFile(new URL("../app/account.html", import.meta.url), "utf8"),
  readFile(new URL("../app/account.js", import.meta.url), "utf8"),
  readFile(new URL("../app/setup.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260929230000_email_contact_consent.sql", import.meta.url), "utf8")
]);

assert.match(html, /Every optional email includes an unsubscribe link/i);
assert.match(html, /Unsubscribe from optional updates/);
assert.match(script, /email_contact_preferences/);
assert.match(setupScript, /ignoreDuplicates: true/);
assert.match(script, /opted_in: optedIn/);
assert.match(script, /You’re unsubscribed/);
assert.match(migration, /enable row level security/i);
assert.match(migration, /auth\.uid\(\) = user_id/g);
assert.match(migration, /revocable/i);

console.log("Email contact consent checks passed.");
