import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261005013000_database_security_hardening.sql", import.meta.url),
  "utf8"
);

assert.match(migration, /insert into storage\.buckets[\s\S]*?'meal-photos'[\s\S]*?false[\s\S]*?8388608/i);
assert.match(migration, /array\['image\/jpeg', 'image\/png', 'image\/webp', 'image\/gif'\]/i);
assert.match(migration, /on conflict \(id\) do update set[\s\S]*?public = false/i);

for (const policy of ["read", "upload", "update", "delete"]) {
  assert.match(migration, new RegExp(`Users can ${policy} their own meal photos`, "i"));
}
assert.ok(
  (migration.match(/\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g) ?? []).length >= 5,
  "Every meal-photo policy branch must enforce first-folder ownership."
);

assert.match(migration, /create or replace function public\.enforce_verified_contact_email\(\)/i);
assert.match(migration, /security definer[\s\S]*?set search_path = pg_catalog/i);
assert.match(migration, /from auth\.users as auth_user[\s\S]*?email_confirmed_at is not null/i);
assert.match(migration, /requester_id is not null and requester_id is distinct from new\.user_id/i);
assert.match(migration, /supplied_email is distinct from verified_email/i);
assert.match(migration, /new\.email := verified_email/i);
assert.match(migration, /set opted_in = false[\s\S]*?not exists \([\s\S]*?email_confirmed_at is not null/i);
assert.match(migration, /before insert or update on public\.email_contact_preferences/i);

assert.match(migration, /create or replace function public\.set_customer_feedback_server_timestamps\(\)/i);
assert.match(migration, /server_time timestamptz := clock_timestamp\(\)/i);
assert.match(migration, /new\.created_at := server_time[\s\S]*?new\.updated_at := server_time/i);
assert.match(migration, /new\.created_at := old\.created_at/i);
assert.match(migration, /new\.public_consent_updated_at := case[\s\S]*?when new\.public_display_consent then server_time/i);
assert.match(migration, /before insert or update on public\.customer_feedback/i);

const historyFunction = migration.match(
  /create or replace function public\.capture_customer_feedback_history\(\)[\s\S]*?\n\$\$;/i
)?.[0] ?? "";
assert.match(historyFunction, /captured_at := clock_timestamp\(\)/i);
assert.match(historyFunction, /source_updated_at,[\s\S]*?recorded_at[\s\S]*?captured_at,[\s\S]*?captured_at/i);
assert.match(historyFunction, /when unique_violation then[\s\S]*?interval '1 microsecond'/i);
assert.doesNotMatch(historyFunction, /on conflict[\s\S]*?do nothing/i);

assert.match(migration, /set saved_recipe_id = null[\s\S]*?recipe\.user_id = feedback\.user_id/i);
assert.match(migration, /create unique index if not exists saved_recipes_id_user_id_idx[\s\S]*?\(id, user_id\)/i);
assert.match(migration, /foreign key \(saved_recipe_id, user_id\)[\s\S]*?references public\.saved_recipes \(id, user_id\)/i);
assert.match(migration, /create policy "Users add their own recipe feedback"[\s\S]*?saved_recipe_id is null[\s\S]*?recipe\.user_id = recipe_beta_feedback\.user_id/i);

console.log("Database security-hardening migration checks passed.");
