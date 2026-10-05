import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const authHtml = read("app/auth.html");
const auth = read("app/auth.js");
const accountHtml = read("app/account.html");
const account = read("app/account.js");
const client = read("app/supabase-client.js");
const deletion = read("supabase/functions/delete-account/index.ts");

assert.match(authHtml, /id="mfa-signin-form"[^>]*hidden/);
assert.match(authHtml, /autocomplete="one-time-code"/);
assert.match(auth, /getAuthenticatorAssuranceLevel\(\)/);
assert.match(auth, /mfa\.listFactors\(\)/);
assert.match(auth, /factor\.status === "verified"/);
assert.match(auth, /\["totp", "phone"\]/);
assert.match(auth, /mfa\.challengeAndVerify\(/);
assert.match(auth, /mfa\.challenge\(\{ factorId: factor\.id, channel: "sms" \}\)/);
assert.match(auth, /mfa\.verify\(\{ factorId: pendingMfaFactorId, challengeId: pendingMfaChallengeId, code \}\)/);
assert.match(authHtml, /id="mfa-send-phone-code"/);
assert.match(auth, /signOut\(\{ scope: "local" \}\)/);

assert.match(client, /getAuthenticatorAssuranceLevel\(\)/);
assert.match(client, /hasVerifiedFactor && assurance\.data\.currentLevel !== "aal2"/);
assert.match(client, /auth\.html\?mfa=required&returnTo=/);
assert.match(client, /location\.pathname \+ location\.search \+ location\.hash/);

assert.match(accountHtml, /id="mfa-enroll"/);
assert.match(accountHtml, /id="mfa-enrollment-code"[^>]*autocomplete="one-time-code"/);
assert.match(account, /mfa\.enroll\(\{[\s\S]*factorType: "totp"/);
assert.match(account, /mfa\.challengeAndVerify\(/);
assert.match(account, /mfa\.challenge\(\{ factorId: factor\.id, channel: "sms" \}\)/);
assert.match(account, /mfa\.verify\(\{ factorId: factor\.id, challengeId: mfaPhoneChallengeId, code \}\)/);
assert.match(accountHtml, /id="mfa-resend-phone-code"/);
assert.match(account, /mfa\.unenroll\(/);

assert.match(deletion, /auth\.admin\.mfa\.listFactors\(\{ userId: user\.id \}\)/);
assert.match(deletion, /hasVerifiedFactor && jwtAssuranceLevel\(authHeader\) !== "aal2"/);

console.log("MFA security checks passed.");
