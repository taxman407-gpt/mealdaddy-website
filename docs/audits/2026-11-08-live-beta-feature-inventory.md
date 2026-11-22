# Live-site to October-beta change inventory

Checked 2026-11-08 at 18:41 UTC. This is an inventory, not full release approval.

## Deployed evidence

Read-only GitHub Actions run 42511217040, job 128824490444, fetched public files from www.mealdaddy.ai and mealdaddy-october-test.taxman407.workers.dev. The beta files were compared byte-for-byte with a private-beta build of commit 5f35ef055aaccf6ccab0bd5bc4170624438bc7b5. No login, email, payment, meal write, or account change occurred in this inventory run.

All 16 checked beta files returned HTTP 200 and exactly matched that build: app.html, app.js, auth.html, auth.js, supabase-client.js, meal-photos.js, meal-portion.js, meal-drafts.js, draft-navigation.js, photo-review.js, saved-foods.js, byok-vault.js, optional-diagnostics.js, adult-eligibility.js, beta-controls.js, and founding-license.js. All differed from the corresponding production response; ten new modules were absent from production with HTTP 404.

The deployed beta contains recoveryCodeVerificationPending and the updated auth source. This confirms deployment of today's recovery code/password-preservation correction, not completion of a real password-change test. Production auth does not contain that new fix.

## Navigation and existing features

Production's top tabs begin Today, Log, Entries, Plan, More. Beta adds a first enrollment view labeled 'Pick a Plan'. The visible label is not yet 'Enrollment'. Both deployed app scripts contain the existing weekly-report handling. This does not prove implementation of the separately requested new weekly-progress/supportive-message panel; do not count existing weekly reports as a new beta feature.

Meal-edit replacement, Restaurant Mode, recipe recreation, the Today nutrient metrics, and owner-only navigation existed before this branch. Describe the beta's changes to those areas as enhancements, not entirely new features.

## Member-facing additions and enhancements

- Separate plan-selection navigation.
- Direct consumed-percentage editing without requiring photos; controlled nutrient scaling and restoration.
- Multiple meal-photo support and photo handling/validation.
- Explicit Add/Exclude/Correct handling for uncertain or unmentioned photo items, including Add Corrected Entry.
- Leftover-review draft preservation and stale-estimate protection.
- Account-scoped text/photo drafts, browser-Back handling, and protection against late draft restoration replacing fresh typing.
- Stronger concurrent-edit protection instead of silently overwriting another tab's changes.
- Saved-food/recipe recalculation as a reviewable preview, preserving manual values until Save; device-only saved-food defaults for users without an explicit preference.
- Clearer composition-score versus amount-consumed explanations.
- Explicit beta AI funding/provider selection; BYOK adapters for OpenAI, Anthropic and Gemini, encrypted device credentials, and optional account-vault infrastructure. Credential configuration and live provider acceptance are separate checks.
- Adults-only self-attestation and optional, consent-based diagnostic collection.
- Password-recovery code-state preservation, repeated-event guard, duplicate-request protection, clearer rate-limit feedback and coordinated auth cache references.

## Beta operation

The private-beta build uses the same production account database, invitation gating and beta-prefixed server functions. Checkout and account-deletion actions are disabled in the beta build. The separate sample lab must not be confused with real shared account records. The isolated October Supabase project is not the tester-facing beta's account database.

## Commercial and owner features in the beta branch

The branch adds monthly/BYOK/lifetime policy handling, founding-availability displays, lifetime maintenance logic, referral attribution and ledgers, owner commission review, registration/conversion reporting, welcome-template editing/outbox controls, beta invitation/provider controls, and AI-processing/photo/search cost tracking. Presence of source or a screen does not establish activated billing, payouts, email sending or complete owner browser acceptance.

Current membership-policy.mjs specifies Standard $9.99/month, BYOK $6.99/month, founding lifetime $350/$250, later lifetime offers $395/$295, three included maintenance years, then initially $60/$42 per year, with no skipped-year back fees.

Current referral-policy.mjs still calculates lifetime affiliate commission at 0.075 (7.5%), not the later owner-requested 22.5%. This remains an implementation gap. The October 31 second-payment subscriber reward work is separate from affiliate commissions.

Cash/swag/maintenance reward redemption, actual affiliate transfer/debit workflows, complete local/offline ledger operation, physical Android Back acceptance and remaining live-provider acceptance are not certified complete by this inventory.

## Separate November 8 database correction

Earlier today the production family-access conversion function was corrected to select Standard/core when converting a beta BYOK user to family access, preserving their user ID and records. Because both interfaces share that database, this correction is not beta-only. Its applied migration is recorded in the separate shared-database audit/PR 9.

## Still-required end-to-end evidence

A successful real recovery email request and mailbox delivery were verified in the preceding task. A completed password change and subsequent browser login, plus a signed-in cross-site save/edit/reload round trip, remain unverified. This inventory does not replace those tests.
