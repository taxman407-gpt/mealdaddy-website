import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261005023000_conditional_mfa_enforcement.sql", import.meta.url),
  "utf8"
);
const normalized = migration.replace(/\s+/g, " ");

assert.match(migration, /create schema if not exists app_private;/i);
assert.match(migration, /revoke all on schema app_private from public, anon, authenticated;/i);
assert.match(migration, /grant usage on schema app_private to authenticated;/i);

const helper = migration.match(
  /create or replace function app_private\.mfa_access_allowed\(\)[\s\S]*?\n\$\$;/i
)?.[0] ?? "";
assert.match(helper, /returns boolean/i);
assert.match(helper, /language sql[\s\S]*?stable[\s\S]*?security definer/i);
assert.match(helper, /set search_path = pg_catalog/i);
assert.match(helper, /\(select auth\.uid\(\)\) is not null/i);
assert.match(helper, /not exists \([\s\S]*?from auth\.mfa_factors as factor/i);
assert.match(helper, /factor\.user_id = \(select auth\.uid\(\)\)/i);
assert.match(helper, /factor\.status = 'verified'/i);
assert.match(helper, /coalesce\(\(select auth\.jwt\(\) ->> 'aal'\), 'aal1'\) = 'aal2'/i);
assert.doesNotMatch(helper, /exception|when others/i, "MFA metadata failures must not be converted into an allow result.");
assert.match(migration, /revoke all on function app_private\.mfa_access_allowed\(\) from public, anon, authenticated;/i);
assert.match(migration, /grant execute on function app_private\.mfa_access_allowed\(\) to authenticated;/i);

const privateTables = [
  "profiles",
  "ledger_entries",
  "subscriptions",
  "complimentary_access_grants",
  "customer_feedback",
  "customer_feedback_history",
  "weight_entries",
  "saved_foods",
  "email_contact_preferences",
  "saved_recipes",
  "recipe_beta_feedback"
];

for (const table of privateTables) {
  const policy = new RegExp(
    `drop policy if exists "Require MFA when enrolled" on public\\.${table}; ` +
      `create policy "Require MFA when enrolled" on public\\.${table} as restrictive for all to authenticated ` +
      `using \\(\\(select app_private\\.mfa_access_allowed\\(\\)\\)\\) ` +
      `with check \\(\\(select app_private\\.mfa_access_allowed\\(\\)\\)\\);`,
    "i"
  );
  assert.match(normalized, policy, `${table} must have an idempotent restrictive conditional-MFA policy.`);
}

assert.equal(
  (migration.match(/as restrictive/gi) ?? []).length,
  privateTables.length + 1,
  "Every table policy plus the private-photo storage policy must be restrictive."
);
assert.equal(
  (migration.match(/drop policy if exists/gi) ?? []).length,
  privateTables.length + 1,
  "Every conditional-MFA policy must be safe to recreate."
);

assert.match(
  normalized,
  /drop policy if exists "Require MFA for private photo buckets when enrolled" on storage\.objects; create policy "Require MFA for private photo buckets when enrolled" on storage\.objects as restrictive for all to authenticated/i
);
assert.equal(
  (migration.match(/bucket_id not in \('meal-photos', 'saved-food-photos'\)/gi) ?? []).length,
  2,
  "The storage USING and WITH CHECK expressions must protect both private buckets without affecting unrelated buckets."
);
assert.ok(
  (migration.match(/or \(select app_private\.mfa_access_allowed\(\)\)/gi) ?? []).length >= 2,
  "Both storage policy expressions must require the conditional-MFA helper for protected buckets."
);
assert.doesNotMatch(migration, /to service_role/i, "Conditional MFA policies must not change service-role behavior.");

console.log("Conditional MFA enforcement migration checks passed.");
