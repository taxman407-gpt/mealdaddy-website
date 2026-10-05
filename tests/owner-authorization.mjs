import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261005033000_owner_accounts_registry.sql");
const normalizedMigration = migration.replace(/\s+/g, " ");
const helper = read("supabase/functions/_shared/owner-authorization.ts");
const emailLiteral = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const uuidLiteral = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

assert.doesNotMatch(migration, emailLiteral);
assert.doesNotMatch(migration, uuidLiteral);
assert.doesNotMatch(helper, emailLiteral);
assert.doesNotMatch(helper, uuidLiteral);

assert.match(migration, /create table if not exists public\.owner_accounts/i);
assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete restrict/i);
assert.match(migration, /alter table public\.owner_accounts enable row level security/i);
assert.match(
  normalizedMigration,
  /revoke all on table public\.owner_accounts from public, anon, authenticated, service_role/i
);
assert.match(
  normalizedMigration,
  /grant select on table public\.owner_accounts to service_role/i
);
assert.doesNotMatch(migration, /grant[^;]*(?:insert|update|delete)[^;]*owner_accounts/i);
assert.doesNotMatch(migration, /create policy[^;]*owner_accounts/i);
assert.match(migration, /create trigger prevent_owner_account_mutation_trigger/i);
assert.match(migration, /before update or delete on public\.owner_accounts/i);
assert.match(
  normalizedMigration,
  /revoke all on function public\.prevent_owner_account_mutation\(\) from public, anon, authenticated, service_role/i
);

const bootstrapFunction = migration.match(
  /create or replace function public\.bootstrap_owner_account\(requested_user_id uuid\)[\s\S]*?\n\$\$;/i
)?.[0] ?? "";
assert.match(bootstrapFunction, /security definer/i);
assert.match(bootstrapFunction, /set search_path = pg_catalog/i);
assert.match(bootstrapFunction, /lock table public\.owner_accounts in exclusive mode/i);
assert.match(bootstrapFunction, /if exists \(select 1 from public\.owner_accounts\) then/i);
assert.match(bootstrapFunction, /where owner_account\.user_id = requested_user_id/i);
assert.match(bootstrapFunction, /insert into public\.owner_accounts \(user_id\)/i);
assert.ok(
  bootstrapFunction.indexOf("lock table") < bootstrapFunction.indexOf("if exists"),
  "The bootstrap must lock the registry before checking whether it is empty."
);
assert.match(
  normalizedMigration,
  /revoke all on function public\.bootstrap_owner_account\(uuid\) from public, anon, authenticated, service_role/i
);
assert.match(
  normalizedMigration,
  /grant execute on function public\.bootstrap_owner_account\(uuid\) to service_role/i
);

const aalIndex = helper.indexOf('jwt.aal !== "aal2" || jwt.subject !== user.id');
const factorIndex = helper.indexOf("admin.auth.admin.mfa.listFactors");
const configuredIdIndex = helper.indexOf('configuredValues("MEALDADDY_ADMIN_USER_IDS")');
const registryIndex = helper.indexOf('.from("owner_accounts")');
const configuredFallbackGuardIndex = helper.indexOf("if (configuredOwnerIds.length)");
const legacyEmailIndex = helper.indexOf('configuredValues("FEEDBACK_ADMIN_EMAILS")');
const bootstrapIndex = helper.indexOf('admin.rpc("bootstrap_owner_account"');
for (const [label, index] of [
  ["AAL2 check", aalIndex],
  ["live factor lookup", factorIndex],
  ["configured ID lookup", configuredIdIndex],
  ["owner registry lookup", registryIndex],
  ["configured-ID fallback guard", configuredFallbackGuardIndex],
  ["legacy email lookup", legacyEmailIndex],
  ["bootstrap RPC", bootstrapIndex]
]) {
  assert.ok(index >= 0, `${label} is required.`);
}
assert.ok(aalIndex < configuredIdIndex && factorIndex < configuredIdIndex);
assert.ok(aalIndex < registryIndex && factorIndex < registryIndex);
assert.ok(aalIndex < bootstrapIndex && factorIndex < bootstrapIndex);
assert.ok(
  registryIndex < configuredFallbackGuardIndex &&
    configuredFallbackGuardIndex < legacyEmailIndex &&
    legacyEmailIndex < bootstrapIndex
);
assert.match(helper, /factor\.status === "verified"/);
assert.match(helper, /factor\.factor_type === "totp" \|\| factor\.factor_type === "phone"/);
assert.match(helper, /subject: typeof payload\.sub === "string" \? payload\.sub : ""/);
assert.match(helper, /user\.email_confirmed_at \? normalizeEmail\(user\.email\) : ""/);
assert.doesNotMatch(helper, /console\.(?:log|info|warn|error)/);

for (const functionName of ["manage-family-access", "summarize-feedback"]) {
  const source = read(`supabase/functions/${functionName}/index.ts`);
  const authIndex = source.indexOf("auth.getUser");
  const authorizationIndex = source.indexOf("await requireOwnerAuthorization(");
  assert.match(
    source,
    /import \{ requireOwnerAuthorization \} from "\.\.\/_shared\/owner-authorization\.ts"/
  );
  assert.ok(authIndex >= 0 && authorizationIndex > authIndex);
  assert.doesNotMatch(source, /MEALDADDY_ADMIN_USER_IDS|FEEDBACK_ADMIN_EMAILS/);
  assert.doesNotMatch(source, /\.auth\.mfa\.listFactors|\.auth\.admin\.mfa\.listFactors/);
}

const familyAccess = read("supabase/functions/manage-family-access/index.ts");
const familyGateIndex = familyAccess.indexOf("await requireOwnerAuthorization(");
assert.ok(familyGateIndex < familyAccess.indexOf('.from("complimentary_access_grants")'));
assert.ok(familyGateIndex < familyAccess.indexOf('"set_complimentary_family_access"'));

const feedback = read("supabase/functions/summarize-feedback/index.ts");
const feedbackGateIndex = feedback.indexOf("await requireOwnerAuthorization(");
assert.ok(feedbackGateIndex < feedback.indexOf('.from("customer_feedback_history")'));
assert.doesNotMatch(feedback, /factorData\?\.totp/);

console.log("Owner authorization bootstrap checks passed.");
