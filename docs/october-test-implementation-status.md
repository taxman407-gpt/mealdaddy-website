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
