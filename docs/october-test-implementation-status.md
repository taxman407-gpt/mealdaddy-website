# October 21 isolated test implementation

## Implemented and verified
- Added browser-only sample lab, with fixed fictional values and no account requirement, using the same portion and sample-calculation modules as the backend test harness.
- Direct percent-consumed field and description focus in the actual app editor; per-user device-only Quick Log and edit drafts, including Quick Log photo storage through IndexedDB and immediate text backup. Actual Android navigation and photo persistence are not yet browser-verified.
- Separate test asset output (`dist-test`) with build-time production endpoint/secret scan. Production HTML and Worker configuration remain separate.
- Test Worker restricted to its own host; root redirects to the no-login sample lab; no production canonical redirect; private paths denied; no caching/indexing; CSP connects only to the test Supabase project.
- Test-specific banner and sample meal picker. Billing and unconfigured functions explicitly blocked before requests; no false checkout success.
- Real test-project Auth and RLS-protected ledger API. Deployed authenticated sample-only estimate-entry function and read-only owner-access-status to dkirmzthyynogkkaacmj.
- Fixed, explicitly fictional fixture values for pizza, salad with/without dressing, and dressing alone. Leading percentage scales all nutrient fields once. Arbitrary foods/photos fail explicitly; no live AI or clinical inflammation inference.
- Existing repository test suite and isolated-bundle tests passed locally.
- Executed transactional database RLS fixture: cross-account meal/profile reads, cross-account insert/update/delete, ownership reassignment blocked; own update succeeded. All transactional fixtures rolled back.
- Executed actual Auth/REST/Edge Function tests with two temporary synthetic accounts: own insert/estimate, other-user read and estimate rejection, 100% to 50% edit, carbs/fiber/net carbs, same timestamp/single row, dressing removal, owner=false, unauthenticated request rejection all passed. Sessions signed out; temporary identities removed separately after the test.

## Scope limits
This is an integrated fixture test environment, not completion of the October feature release. Live AI/image analysis, BYOK, new membership plans, billing/referrals, full Android/leftover-photo draft acceptance, and full photo confirmation UX remain outstanding. Sign-up currently requires email confirmation; do not use production passwords or real health records. Test-only credentials and redirect configuration for user acceptance still need validation.

Ten INFO advisor notices for RLS-enabled server-only tables without direct policies remain; no claim of a complete security audit. Baseline schema reconstruction/migration reconciliation remains a release gate. Production deployment requires owner acceptance.
