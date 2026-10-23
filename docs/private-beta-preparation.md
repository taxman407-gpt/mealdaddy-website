# Private beta readiness

## Deployment design

- Beta frontend: `mealdaddy-october-test.taxman407.workers.dev`, feature branch only, `wrangler.beta.jsonc`.
- Existing production frontend and existing function names remain unchanged.
- Beta uses production Supabase identities and the existing user-owned records, with separate `beta-*` functions and `beta-access`. No customer-data copy or migration at frontend cutover is required.
- Invitation checks are enforced by beta APIs and the beta frontend. Normal production users retain their current app access. The owner registry is invited during setup; additional tester email addresses are approved through Owner Tools.
- New schema is additive. Existing family grants default to Standard; beta invitations never overwrite family grants or create paid subscriptions. The beta frontend uses the invitation's access choice for its own membership state.

## Tester and owner controls

Owner Tools includes approve/revoke/restore invitations, Standard or BYOK complimentary access, sponsor request counts, per-user/day and global/day limits, total allowance, and an on/off switch. Owner actions require current MFA and the existing owner registry. Invitations are approval records; the form does not send email.

More includes Beta AI connection: sponsor-paid Claude, sponsor-paid Gemini, or explicitly chosen personal BYOK. No automatic funding/provider fallback. Missing credentials block AI while saved records remain available. Personal BYOK keys are encrypted on the device by default; optional account storage remains separately gated by its vault configuration. API keys are never included in account records or exports.

Payments and account deletion are disabled in the beta build. The plan screen remains available for review, with disabled checkout controls and actual availability. The separate sample meal lab remains browser-only and fictional. No sample purchases are inserted into shared billing ledgers.

## Credentials and activation still required

Enter dedicated sponsor secrets in the production project's Edge Function Secrets (the beta function namespace uses that project's runtime):

- `BETA_ANTHROPIC_API_KEY` and `BETA_ANTHROPIC_MODEL`
- `BETA_GEMINI_API_KEY` and `BETA_GEMINI_MODEL`

Never paste keys into chat, source, a browser URL, or the tester's personal BYOK form. Select supported text/photo/structured-output model IDs explicitly. Configure provider dollar caps, then set the sponsor request allowances and enable spending in Owner Tools. Defaults are 20 requests/tester/UTC day, 50 global/UTC day, 200 total; spending is OFF. Request limits are not dollar caps. Failed attempts consume request reservations conservatively.

Encrypted account-key storage is configured with a securely generated server vault key and `ENABLE_BYOK_CLOUD=true`. Device-only storage remains the default. The master key is held only in Supabase secrets and is not stored in source or exported. Current web search requires an explicitly selected compatible OpenAI personal connection; Claude/Gemini do not silently switch to OpenAI for restaurant or optional recipe searches.

After credentials are present: perform real text/photo/structured-output calls for each funded provider, test provider rejection/quota behavior, then have Steve and invited testers exercise the actual phone app (including Android Back) for one or two days. No production frontend cutover before Steve approves.

## Data continuity

Server meal history, uploaded selected photos, saved server foods, profiles and goals remain attached to the same user ID. Device-only API keys, drafts, and device foods are origin-specific; reconnect keys and use explicit export/re-entry as appropriate when changing site addresses. No silent upload or transfer of device data is performed.

## Internal verification

- Repository regression suite, beta build, and host/CSP/noindex/checkout-isolation checks passed.
- Isolated-project real password sign-in and invitation acceptance passed; an uninvited account and a revoked already-signed-in token were rejected.
- Real isolated API checks passed: complimentary BYOK grant, owner-only action rejection, cross-account meal isolation, explicit funding requirement, and missing sponsor credential rejection.
- Transactional SQL tests exercise service-role permissions, invitation plan changes, revocation, unconfirmed-email rejection, audit records, quota enforcement across providers, and denial of direct authenticated administration. Tests roll back all synthetic rows.
- Shared database before/after initial compatibility additions: 6 users, 390 ledger entries, 2 subscriptions, 3 pre-existing grants. Sponsor spending and welcome-email delivery remain OFF.
- An initial real-session test exposed a missing auth-table permission. Fixed with a service-only, exact-match identity function in `app_private`; no broad auth.users grant was added. Retested successfully.

No real provider API call has been made in this preparation. Browser acceptance requiring Steve's production login and live provider acceptance are separate from synthetic and isolated tests.

## Deployment verification

The beta frontend was published from the October feature branch. The deployed sign-in page shows shared-account instructions and complimentary/no-checkout terms. At a measured 320 CSS pixels it has no horizontal overflow and all visible buttons meet a 48px minimum height. The existing production deployment remains version `4466ebda`.

The unused client-callable beta identity RPC was removed after the advisory review; identity lookup remains in a private service-only function. Existing project advisories about the pre-existing `rls_auto_enable` function and leaked-password protection are separate from beta authorization. Real authenticated API tests used a temporary isolated account; that account and its session artifact were removed afterward. Steve's authenticated browser walkthrough and Android Back hardware behavior remain acceptance checks for the tester period.
