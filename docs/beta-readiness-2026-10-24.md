# Beta acceptance checkpoint — October 24, 2026

The current test hostname serves the private beta with shared MealDaddy identities, not the retired isolated fixture environment. Use `npm run build`, `node scripts/build-private-beta.mjs`, then `npm run test:beta-deployment` for public asset verification. The older `test:deployment` command intentionally checks the separate fixture build and is not a beta readiness check.

Verified this session:
- Full repository regression suite passed (exit 0).
- Build and private-beta packaging passed.
- Eleven deployed authentication, app, BYOK and draft assets matched the local build byte for byte.
- Public beta health reports shared accounts, beta API namespace and disabled billing.
- Connected browser rendered the actual beta sign-in page with complimentary invitation-only access instructions.

Still blocked or unverified:
- Browser is at sign-in; Steve must complete his login and MFA before the authenticated walkthrough can continue. No password or account credential was read or changed.
- Real provider calls remain unverified. The prior preparation report requires dedicated sponsor credentials/model choices and spending activation, or an explicitly selected personal BYOK connection. The public health readiness label is static configuration, not proof of current secret presence.
- Stripe sandbox checkout/webhooks and email delivery acceptance remain separate pending integrations. Beta checkout is intentionally disabled.
- Android hardware Back behavior requires device acceptance.

No full-app readiness claim, provider call, customer record change, production deployment or billing activation was made in this checkpoint.

## Authenticated Edge walkthrough — October 24

- Steve completed sign-in. The actual private beta loaded the Log and More screens.
- Account & Privacy confirmed the session had completed two-step verification; Owner Tools loaded successfully.
- The owner beta invitation was approved. Sponsor controls loaded with spending disabled, 20 requests per tester/day, 50 globally/day, 200 total, and zero sponsor requests recorded.
- More → Beta AI connection had no source selected in this browser.
- Live AI acceptance is blocked pending an explicit funded connection. Secret presence was not inspected, and no provider request, spending activation, or meal-record mutation was performed.
- Left the authenticated browser on More for connection setup. This supersedes the sign-in blocker above, but not the outstanding provider, payment, email, or Android acceptance checks.

## OpenAI acceptance — October 24

- Published explicit OpenAI selection in commit 2768915157c67cb6fef5e081bf372103cd4fb08e; six beta function deployments are version 4. Production function names were not deployed.
- All eleven deployed beta assets matched; the full regression suite and new entitlement/invitation/cost-limit checks passed.
- In Steve's authenticated Edge session, selected OpenAI using the existing Standard allowance. A real kitchen-planning request returned a two-ingredient egg/olive-oil suggestion without adding a ledger entry.
- Reload preserved `hosted_openai`. At 390 CSS pixels, the selected option and status were readable without horizontal overflow; see beta-openai-phone.png. Restored the normal viewport afterward.
- This confirms real text guidance, not photo-analysis/correction/save acceptance or Android hardware testing. Nutrition accuracy remains a separate check: the response estimated 220–240 kcal for two large eggs plus one tablespoon olive oil, which appears understated and needs review.

## Saved recipe recalculation — October 24

- Added explicit Recalculate nutrition submit control; recipe/serving edits recalculate automatically, and new home recipes with descriptions and empty nutrition trigger analysis. Manual numeric corrections remain possible.
- Fixed silent 700-character recipe truncation; accepts up to 1600 characters with explicit rejection above that length. Missing/non-numeric and all-zero home-recipe analyses are rejected before writes. Validation still settles provider usage.
- Added ingredient breakdown, server-side batch division, and exact overrides for unambiguous same-volume written label statements. These checks caught incorrect model scaling of pumpkin, almond flour, and butter. Label-free ingredients remain estimates.
- Full regression suite and new trigger/runtime/batch/label arithmetic tests pass. Published through c7e41d64f4e2d7b67771dd8d02c846a47d086fed; beta-analyze-saved-food version 9 is deployed.
- Earlier browser tests verified auto-save and unchanged-description retry, each updating the favorite and two linked entries today. The final version-9 request stalled; refreshing the existing tab left initialization pending, and a fresh navigation timed out. No confirmed final result from version 9.
- Pumpkin favorite 25ba0b69-6702-46cf-b2f4-9eae8c436fe0 still showed the pre-label-override 159.2 kcal / 10g carbs / 6.3g net-carbs estimate at the last database read. These are provisional and must not be represented as final corrected values. Final real-request validation and phone-button QA remain outstanding.

## Manual-value restoration — October 24

- Steve clarified that his hand-entered nutrition came from the earlier ChatGPT breakdown and must take precedence over recalculation. Retrieved that prior breakdown rather than guessing replacements.
- Published manual-nutrition protection in 176ccd3277786483174fc14ceb3649545ab345a3. Normal Save preserves manual numeric edits even when recipe text changes simultaneously. The persisted manual source prevents later implicit replacement; explicit Recalculate nutrition is the override. Consolidated component totals match the manual fields rather than retaining contradictory AI ingredient totals.
- Full tests and build passed. Verified deployed saved-foods.js matches the tested build and confirmed the updated explanation in the browser.
- Restored supported original per-muffin fields: 144 kcal, 5.7g protein, 11g fat, 3.6g saturated fat, 6.6g total carbs, 2.9g fiber, 3.7g net carbs, 130mg sodium. The original figures are estimates. Cholesterol (~100mg in the earlier breakdown) has no field in this editor and was not inserted into another nutrient field.
- Browser confirmed two linked entries updated; database read verified both one-serving entries at 144 kcal and 3.7g net carbs and the favorite marked manual with matching components. This restoration supersedes the provisional muffin values reported above. No new meals were added.
- Verified the restored card on phone and desktop layouts; saved proof in muffin-manual-values-restored.png. Reset the phone viewport afterward.
