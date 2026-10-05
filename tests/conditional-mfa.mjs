import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const helper = read("supabase/functions/_shared/conditional-mfa.ts");
const config = read("supabase/config.toml");

assert.match(helper, /admin\.auth\.admin\.mfa\.listFactors\(\{ userId \}\)/);
assert.match(helper, /factorResult\.error \|\| !Array\.isArray\(factorResult\.data\?\.factors\)/);
assert.match(helper, /factor\.status === "verified"/);
assert.match(helper, /hasVerifiedFactor && jwtAssuranceLevel\(authHeader\) !== "aal2"/);
assert.match(helper, /status: 403/);
assert.match(helper, /status: 500/);
assert.match(helper, /Call only after auth\.getUser\(\) has validated/);

const protectedFunctions = [
  "estimate-entry",
  "coach-action",
  "analyze-saved-food",
  "adjust-leftovers",
  "recipe-recreation",
  "create-checkout",
  "create-billing-portal"
];

for (const functionName of protectedFunctions) {
  const source = read(`supabase/functions/${functionName}/index.ts`);
  const authIndex = source.indexOf("authClient.auth.getUser()");
  const gateIndex = source.indexOf("await requireConditionalMfa(");
  assert.ok(authIndex >= 0, `${functionName} must validate the bearer token with auth.getUser`);
  assert.ok(gateIndex > authIndex, `${functionName} must run conditional MFA only after user validation`);
  assert.match(source, /import \{ requireConditionalMfa \} from "\.\.\/_shared\/conditional-mfa\.ts"/);
  assert.match(source, /if\s*\(!mfaResult\.ok\)\s*return json\(\{\s*error:\s*mfaResult\.error\s*\},\s*mfaResult\.status\)/);

  const adminSideEffect = /\badmin\s*\.\s*(?:from|rpc|storage)\b/g;
  adminSideEffect.lastIndex = gateIndex;
  const firstSideEffect = adminSideEffect.exec(source);
  assert.ok(firstSideEffect, `${functionName} should contain its expected service-role operation`);
  assert.ok(gateIndex < firstSideEffect.index, `${functionName} must gate service-role operations behind MFA`);
}

const webhook = read("supabase/functions/stripe-webhook/index.ts");
assert.doesNotMatch(webhook, /requireConditionalMfa/);

const deletion = read("supabase/functions/delete-account/index.ts");
assert.match(deletion, /admin\.auth\.admin\.mfa\.listFactors/);
assert.match(deletion, /hasVerifiedFactor && jwtAssuranceLevel\(authHeader\) !== "aal2"/);

assert.match(config, /\[functions\.recipe-recreation\]\s*verify_jwt\s*=\s*true/);
assert.match(config, /\[functions\.stripe-webhook\]\s*verify_jwt\s*=\s*false/);

console.log("Conditional MFA checks passed.");
