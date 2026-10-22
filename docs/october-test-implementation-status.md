# Deployment isolation restored — 22 October 2026

Using the owner's signed-in Chrome through the Browser extension, restored mealdaddy-website from feature version a2553dec to the last accepted main version 4466ebda (commit 364f18d5ac4238d2dae0525c299d0d4297d6f7a4). Cloudflare shows 4466ebda as the active deployment. A read-only public asset check returned HTTP 200 and byte-for-byte equality between https://www.mealdaddy.ai/app/app.js and origin/main:app/app.js (166939 bytes, SHA256 2db5820ef26d77b8fdd6aea8f769ee3976295415e9c86813cd53a59b8e23e9b2).

Saved the live project's branch/build controls: production branch main; non-production/preview branch builds OFF. After saving, Cloudflare's new Preview Base panel shows preview builds OFF and preview command npx wrangler preview. Production remains npx wrangler deploy. The prior legacy non-production command was npx wrangler deploy, which caused the unintended live frontend deployments.

Verified the separate mealdaddy-october-test project still targets feature/october-2026-upgrade, runs npm run build and deploys with npx wrangler deploy --config wrangler.test.jsonc. Test service version 0e8002c4 was retained during rollback. No production database record or Stripe transaction was queried or changed.

Deployed test API acceptance passed with two synthetic accounts: disabled BYOK defaults, metadata-only account status, owner/MFA denial for report view/export/monitor, service-only email worker, sensitive table/RPC denial and anonymous denial. Sessions were signed out; test accounts and temporary credential file were removed. Welcome remains OFF with zero deliveries.

# Current acceptance checkpoint — 22 October 2026

The Cloudflare test site is available at https://mealdaddy-october-test.taxman407.workers.dev/app/test-lab . The latest served meal-app files match the source build. The full local test suite and synthetic database checks pass.

Implemented source: corrected meal/portion/photo drafts and Back handling; all member AI routes with explicit device/account BYOK; exact monthly/lifetime price policy and maintenance; affiliate/subscriber referral ledgers and invoice credits; audited owner registration report; verified-registration welcome outbox and monitoring.

Deployed test services: fixture-only estimator, owner authorization, referrals, disabled account BYOK storage, owner registration/monitoring report, and disabled service-only welcome worker. The test estimator still never calls a paid AI provider. Billing, referral programs, encrypted account keys and email sending remain unactivated.

Remaining acceptance dependencies: test-only AI/provider keys and capped live-image checks; Stripe sandbox connection/prices/webhooks (the connected account is live and was not used); verified sender/test email credentials and approved activation; owner MFA/browser acceptance and Android hardware Back checks. These are not replaced by mocks. Production rollout/main merge is not approved.

# October 21 isolated test implementation

## Implemented and verified
- Added browser-only sample lab, with fixed fictional values and no account requirement, using the same portion and sample-calculation modules as the backend test harness.
- Direct percent-consumed field and description focus in the actual app editor; per-user device-only Quick Log and edit drafts, including Quick Log photo storage through IndexedDB and immediate text backup. Actual Android hardware Back remains unverified. Browser sample-lab draft text/photo reload restoration passed.
- Separate test asset output (`dist-test`) with build-time production endpoint/secret scan. Production HTML and Worker configuration remain separate.
- Test Worker restricted to its own host; root redirects to the no-login sample lab; no production canonical redirect; private paths denied; no caching/indexing; CSP connects only to the test Supabase project.
- Test-specific banner and sample meal picker. Billing and unconfigured functions explicitly blocked before requests; no false checkout success.
- Real test-project Auth and RLS-protected ledger API. Deployed authenticated sample-only estimate-entry function and read-only owner-access-status to dkirmzthyynogkkaacmj.
- Fixed, explicitly fictional fixture values for pizza, salad with/without dressing, and dressing alone. Leading percentage scales all nutrient fields once. Arbitrary foods/photos fail explicitly; no live AI or clinical inflammation inference.
- Existing repository test suite and isolated-bundle tests passed locally.
- Executed transactional database RLS fixture: cross-account meal/profile reads, cross-account insert/update/delete, ownership reassignment blocked; own update succeeded. All transactional fixtures rolled back.
- Executed actual Auth/REST/Edge Function tests with two temporary synthetic accounts: own insert/estimate, other-user read and estimate rejection, 100% to 50% edit, carbs/fiber/net carbs, same timestamp/single row, dressing removal, owner=false, unauthenticated request rejection all passed. Sessions signed out; temporary identities removed separately after the test.

## Deployed browser verification
- Public sample lab verified at https://mealdaddy-october-test.taxman407.workers.dev/app/test-lab.
- Saved half pizza: 500 calories, 40 g total carbs, 10 g fiber, 30 g net carbs.
- Edited the same sample to salad without dressing: one row, same ID and timestamp, 240 calories, no dressing component.
- Reload restored draft notes and a synthetic PNG without adding another meal.
- Original production landing page still displayed its normal public content. GitHub also reports original-Worker build/version artifacts for the feature branch; no main merge or customer-database writes were performed. Active production rollout metadata was not accessible from this browser session.

## Scope limits
This is an integrated fixture test environment, not completion of the October feature release. Live AI/image analysis, BYOK, new membership plans, billing/referrals, full Android/leftover-photo draft acceptance, and full photo confirmation UX remain outstanding. Sign-up currently requires email confirmation; do not use production passwords or real health records. Test-only credentials and redirect configuration for user acceptance still need validation.

Ten INFO advisor notices for RLS-enabled server-only tables without direct policies remain; no claim of a complete security audit. Baseline schema reconstruction/migration reconciliation remains a release gate. Production deployment requires owner acceptance.

## October 22 implementation continuation
- Added photo-item review controls to the full app: Add / Exclude / Correct, editable corrected identity and amount, and “Add Corrected Entry.” Corrections update the same owned ledger row and trigger a replacement text calculation; no clipboard action or new meal insert.
- Added backend classification of unmentioned or uncertain photo components. These are removed before nutrition totals and portion scaling. Photo-only submissions require every detected item to be confirmed. Typed descriptions are retained. Unsuitable-photo responses fail with actionable feedback before saving an estimate.
- Fixed ordinary editor saves to set `input_authority: edited_text` and a fresh edit revision, preventing reuse of the old photograph after an ingredient is removed.
- Added leftover-photo dialog draft persistence, including photo, context, analysis and reviewed percentages. Reopening restores only against the unchanged original estimate. Successful save clears the draft. Concurrent portion updates use compare-and-swap.
- Validation: full build and repository tests, including estimator runtime with mocked provider responses for uncertain beverage exclusion, corrected Diet Dr Pepper, photo-only confirmation, unsuitable-photo rejection, and authoritative edited text. These are deterministic source tests, not live provider or Android hardware acceptance.
- Deployment limitation: the test project's estimator remains the explicit fixture-only implementation. This commit does not replace it with a production-key-dependent live estimator. Live photo/AI acceptance still requires separately configured test provider access; BYOK, pricing/billing/referrals and actual Android Back remain outstanding.

## Draft navigation and portion explanation continuation
- Added a shared history controller for meal edits and leftover-photo reviews. Browser Back saves and closes the open editor; explicit Save/Cancel does not invoke autosave again. Switching editors reuses one temporary history entry instead of accumulating Back traps.
- Photo correction selections and corrected text now persist per user/meal and restore only against an unchanged estimate; successful correction clears that draft. Restoration does not overwrite input already being edited.
- Fixed draft-storage error reporting: text can survive an IndexedDB failure, while failed photo storage and fully blocked storage produce explicit warnings.
- Added a plain-language composition-versus-portion explanation. A uniform 50% portion retains the composition score and halves nutrient quantities; 0% consumed and unresolved photo reviews do not display a completed composition score. Fictional fixtures never receive a health score.
- Added the same navigation controller to the no-login lab for browser acceptance of Back/restore. Full build, repository tests and JavaScript syntax checks pass; unit tests cover Back, Save/Cancel, switching editors, storage failures and score presentation. Actual Android hardware/gesture acceptance remains outstanding.

## Concurrent edit verification
- Ordinary meal/hydration edits and undo-portion saves now compare the original description and estimate before updating. A stale save reports the conflict and preserves the device draft instead of overwriting another tab's work.
- Executed the transactional RLS test against the isolated test project: current snapshot update succeeded, stale description and stale estimate updates affected zero rows, original timestamp preserved; cross-account checks also passed. All synthetic rows rolled back.
- Browser acceptance found an asynchronous draft-restoration race that could replace a percentage typed immediately after opening Edit. Added a touched-input guard to the full app and sample lab; retesting this before marking browser acceptance passed.

- Added `npm run test:deployment` (optional `-- --wait`) to compare SHA-256 hashes of the locally built test JavaScript against the actual test domain, and verify the health endpoint remains fixture-only with billing disabled. A green GitHub check alone is not deployment acceptance.

## Deployed acceptance — d9507b0
- Cloudflare test assets now match the local build byte-for-byte for app.js, draft-navigation.js, meal-drafts.js, photo-review.js and test-lab.js; health remained isolated/fixture-only with billing disabled.
- Live browser: opened the existing salad sample, rapidly entered 50% and notes, pressed browser Back, reopened Edit. The percentage and notes were restored. Ledger remained one meal at 240 calories, with the original ID and timestamp. No save/submission occurred.
- The draft-restoration race found during the first browser pass is fixed and retested. This establishes desktop browser history behavior using the shared controller; it does not establish actual Android hardware or gesture acceptance, nor live image inference.

## BYOK and membership source implementation
- Added request-local provider adapters for OpenAI, Anthropic and Gemini, explicit provider/model selection, fixed API hosts, structured responses, bounded timeouts, no automatic fallback, and sanitized provider failures. BYOK meal estimates require an active entitlement and explicit credentials; hosted keys are not required for BYOK. Key material is never copied into meal records.
- Added account-scoped encrypted device credential storage with a nonexportable wrapping key, session-only option, and remove action. The UI discloses provider usage charges and the request-time transfer through the backend. Optional cloud key storage is not implemented.
- Added canonical membership price validation: Standard $9.99/month, BYOK $6.99/month, Standard Lifetime $350, BYOK Lifetime $250. Checkout rejects mismatched prices before creating a session or reserving a trial. BYOK does not inherit an undisclosed free trial.
- Added lifetime license tables, durable checkout quotes, server-only payment/refund RPCs, owned-read policies and MFA restrictions in the isolated test project. Payment replay cannot extend access twice. License maintenance includes three years, then initially $60/$36 annually; notified changes require 60 days. Reactivation starts from the new payment date without skipped-year fees.
- Added payment-mode checkout, owned quote/line-item validation, paid webhook fulfillment, asynchronous payment success/failure handling, and refund reconciliation. Full purchase refunds remove access; maintenance refunds require reconciliation rather than silently retaining access. Lifetime purchases and monthly subscriptions block duplicate active memberships.
- Added lifetime status and maintenance renewal controls, plus BYOK and lifetime plan choices. Test billing remains disabled. Server activation requires ENABLE_BYOK / ENABLE_LIFETIME_BILLING and separately configured sandbox prices/keys; these new live functions have not been deployed or exercised with real provider/Stripe requests.
- Validation: provider/vault/price/date/unit and estimator/checkout runtime tests with synthetic adapters; transactional test-database purchase, replay, reactivation, refunds, forged access and cross-account checks passed, with fixtures rolled back. This is not live-provider, live-Stripe or Android hardware acceptance. BYOK routing currently covers meal estimation; other AI functions still require follow-up integration.

## Referral implementation and isolated API acceptance
- Added approved-affiliate/subscriber attribution, invite capture across verification and devices, per-user referral screens, and an owner/MFA-protected administration screen. Owner Tools remains entered from Account & Privacy; referral administration is linked within the private owner dashboard.
- Fixed affiliate rates at 15% of eligible collected net subscription receipts in the first 12 months and 7.5% once for lifetime purchases; no maintenance commission. Invoice tax, unrelated charges, out-of-band payments, refunds and payment allocations are handled explicitly. Ambiguous mixed invoices fail for reconciliation instead of silently awarding on unrelated revenue.
- Added receipt/payment idempotency, out-of-order first-payment handling, one subscriber reward per customer, refund reversals and transactional point reservations. Point award/conversion values remain NULL; no unapproved point amounts were selected. Programmes default OFF.
- Added invoice-bound, non-discountable negative invoice items for requested point discounts. Existing promotions are preserved. Invoice/API replay checks prevent duplicate credits; partial credits retain unused points; applied discounts remain capped at $5 per billing month. Refunded points cannot fund a new invoice. Unbound reservations can be canceled; voided/deleted invoices release reservations.
- Pausing new referrals preserves already-promised rewards. Terms are captured at attribution, and the owner settings screen cannot devalue already-promised point conversions. Approved affiliate revocation requires separate review.
- Installed the referral migrations and deployed manage-referrals v1 only to dkirmzthyynogkkaacmj. Actual Auth/REST/function tests with two temporary synthetic accounts passed: disabled defaults, pending application, account isolation, owner/MFA denial, no unapproved codes, malformed input, anonymous denial. Sessions were signed out; temporary accounts and local credentials were removed; verified zero remaining synthetic accounts.
- Transactional database tests passed for rates, lifetime once, first-year window, duplicate notifications, out-of-order delivery, point awards, refunds, split-payment allocation, retained qualifying payments, partial credit/replay, $5 caps and forged-client rejection. All synthetic settings/data rolled back. The security advisor returned 12 INFO notices for intentionally server-only RLS tables, including the prior baseline notices.
- Stripe connection discovery exposed only the live MealDaddy account. No live payment, product, price, refund or payout was created. Live Stripe acceptance requires a separate sandbox connection, its credentials/prices, and webhook configuration. The new webhook/billing functions remain activation-gated; actual Stripe discount delivery has not been exercised.
- The Stripe CLI documentation attempt was blocked by automatic approval review because it attempted an additional telemetry connection. It was not retried; implementation used the connected documentation lookup and official API references instead.

Implementation references: https://docs.stripe.com/api/invoice-payment/list, https://docs.stripe.com/api/invoiceitems/create, https://docs.stripe.com/billing/subscriptions/coupons, https://platform.claude.com/docs/en/build-with-claude/structured-outputs, https://ai.google.dev/gemini-api/docs/generate-content/structured-output.

## Optional account BYOK and remaining AI routes — 22 October
- Optional cloud credentials use server AES-GCM with an account-bound authenticated context, random nonce, and a separately configured 32-byte server master key. Clients have no table read/write access. The test migration is 20261022154054; manage-byok v1 is deployed with feature flags disabled and no master/provider key configured.
- Device/account selection is explicit per device. Saving or deleting a connection does not silently select a different key or provider. Device storage remains the default; no cloud activation occurred.
- Saved-food analysis, leftover comparisons, dinner guidance and recipe recreation now use the same explicit provider connection for BYOK. Active monthly and maintained lifetime entitlements are checked server-side. Provider usage records tokens/model/provider with zero hosted cost for BYOK; concurrency/daily reservations remain enforced.
- Plain-text and structured/image adapters cover all three providers. Current web search is supported only through the explicitly chosen OpenAI connection. Unsupported search fails before reservation/provider calls; BYOK never runs the hosted compatibility retry. Recipe cache keys include provider and model.
- Runtime tests exercise all four endpoints with each provider using synthetic network adapters and no hosted key; missing-key and unsupported-search cases make no provider calls. No live provider acceptance is claimed.

## Owner report and welcome delivery checkpoint
- Owner registration/conversion migration 20261022154758 and owner-conversion-report v1 are deployed in the test project; synthetic SQL and runtime/CSV checks pass. Report access and export are owner+MFA gated and audited; payment evidence requires a real positive, owned, succeeded payment, not just active subscription status.
- Welcome outbox/processor/monitoring source is committed, disabled by default. Local adapter/worker tests pass. The test migration and redeployment of welcome-aware report v2 remain pending because the Supabase connector returned invalid request state/internal errors on write attempts. No welcome tables, scheduler, credentials or sends were activated.
- The migration CLI attempted unsolicited PostHog telemetry and automatic approval review rejected it. It was not retried. Source creation continued, and connector-based database work was attempted separately.

## Welcome test deployment completed
- Split migration application succeeded: 20261022223106 installs the disabled outbox and verification trigger; 20261022223111 adds welcome delivery dates to the server-only owner report.
- Installed SQL tests passed for disabled/new/historical/unverified accounts, repeat verification, exclusive delivery leases, idempotency-window review, client permission denial and account deletion. All synthetic fixtures rolled back.
- Deployed process-welcome-email v1 and owner-conversion-report v2 with JWT validation. Defaults remain disabled with no activation cutoff and zero deliveries. No provider account, sender credentials, scheduler or mail send was created.
- A 31a4793 Cloudflare test build and GitHub verification check succeeded; served app file hash verification passes. The other Cloudflare project also reports a version build for the branch; that does not establish a production traffic deployment. No main merge or production database write was performed.
