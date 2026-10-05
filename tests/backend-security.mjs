import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const savedFood = read("supabase/functions/analyze-saved-food/index.ts");
const leftovers = read("supabase/functions/adjust-leftovers/index.ts");
const webhook = read("supabase/functions/stripe-webhook/index.ts");
const webhookMigration = read("supabase/migrations/20261004233000_stripe_webhook_state_machine.sql");

for (const [name, source, requestKind] of [
  ["saved-food analysis", savedFood, "analyze-saved-food"],
  ["leftover adjustment", leftovers, "adjust-leftovers"]
]) {
  assert.match(source, /\["trialing", "active"\]\.includes\(membership\.status\)/, `${name} must require a current membership`);
  assert.doesNotMatch(source, /past_due/, `${name} must not grant AI access to a past-due membership`);
  assert.match(source, /admin\.rpc\("reserve_ai_usage"/, `${name} must reserve usage atomically`);
  assert.match(source, new RegExp(`requested_kind: "${requestKind}"`));
  assert.match(source, /admin\.rpc\("settle_ai_usage"/, `${name} must settle its reservation`);
  assert.match(source, /finally\s*\{[\s\S]*admin\.rpc\("release_ai_usage"/, `${name} must release on every unfinished path`);
  assert.doesNotMatch(source, /\.from\("ai_usage_events"\)\.insert/, `${name} must not bypass atomic settlement`);
}

assert.match(webhook, /request\.headers\.get\("stripe-signature"\)/);
assert.match(webhook, /constructEventAsync/);
assert.ok(
  webhook.indexOf("constructEventAsync") < webhook.indexOf("claim_stripe_webhook_event"),
  "Stripe signatures must be verified before an event is claimed"
);
assert.match(webhook, /claim_stripe_webhook_event/);
assert.match(webhook, /complete_stripe_webhook_event/);
assert.match(webhook, /fail_stripe_webhook_event/);
assert.match(webhook, /claimStatus === "processed"/);
assert.match(webhook, /claimStatus === "in_progress"/);
assert.match(webhook, /requested_claim_token: claimToken/);
assert.doesNotMatch(webhook, /\.from\("stripe_webhook_events"\)\.insert/);
assert.match(webhook, /if \(error\) throw new Error\(`Subscription write failed/);
assert.match(webhook, /if \(trialGrantError\) throw new Error/);
assert.match(webhook, /if \(trialReleaseError\) throw new Error/);
assert.match(webhook, /if \(completeError \|\| completed !== true\)/);

assert.match(webhookMigration, /status in \('processing', 'processed', 'failed'\)/);
assert.match(webhookMigration, /pg_advisory_xact_lock/);
assert.match(webhookMigration, /interval '10 minutes'/);
assert.match(webhookMigration, /claim_token uuid/);
assert.match(webhookMigration, /and claim_token = requested_claim_token/);
assert.match(webhookMigration, /create or replace function public\.claim_stripe_webhook_event/);
assert.match(webhookMigration, /create or replace function public\.complete_stripe_webhook_event/);
assert.match(webhookMigration, /create or replace function public\.fail_stripe_webhook_event/);
assert.match(webhookMigration, /revoke all on function public\.claim_stripe_webhook_event/);
assert.match(webhookMigration, /grant execute on function public\.claim_stripe_webhook_event/);

console.log("Backend security checks passed.");
