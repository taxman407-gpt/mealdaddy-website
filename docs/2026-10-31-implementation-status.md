# October 31 approved-policy implementation

Branch: `work/approved-oct31`, based on `feature/october-2026-upgrade` at f234410.

## Implemented and tested in this pass

- New subscriber referrals require two qualifying purchases; default reward is 500 one-cent points ($5). Multiple payment allocations of one invoice do not count twice. Refunds re-evaluate qualification; a later qualifying purchase can restore the same reward without duplicating it. Existing attributed promises retain their first-payment rule and conversion. Programs remain disabled unless separately activated.
- Separate optional diagnostics checkbox in Account & Privacy, off without consent. Only allowlisted feature/outcome/time-band/version fields are collected, with account scoping, consent rechecked each time, server-side consent enforcement and a 100-event/day cap. No request body, response body or raw error logging. Essential billing/security/AI usage records remain separate. Account-linked diagnostics are not called anonymous.
- Adults-only policy approved by owner. Signup UI requires 18+ affirmation; signed-in users without a confirmation are routed to a separate eligibility screen. Server AI and new-checkout handlers require the stored confirmation before proceeding. Billing management, exports and deletion remain reachable. This is self-attestation, not independent age verification; registration via a raw Auth API is not prevented by a new auth hook.
- Draft Terms/Privacy updated for approved age, diagnostics and commercial decisions; future cash/swag/maintenance reward redemption explicitly marked unavailable.
- Existing BYOK sold-out behavior already selects the regular offer; regression test wording corrected. No production price changes.

## Validation evidence

- Full Node regression suite passed after the new age and diagnostics tests.
- Isolated project `dkirmzthyynogkkaacmj`: four migrations applied (second-payment rule, diagnostics consent, adult eligibility, diagnostic feature allowlist correction).
- `tests/sql/referral-second-payment.sql`: passed split invoice, replay, refund, requalification, once-only award and client denial checks.
- `tests/sql/october-referrals.sql`: passed existing affiliate and legacy reward tests.
- `tests/sql/privacy-eligibility.sql`: passed default-off/withdrawal, field restrictions, server timestamps, daily cap, self-attestation and cross-account isolation.
- All SQL fixtures rolled back. No production records read or modified for these tests; no payments or emails sent.
- Isolated security advisor: no findings for the new tables; existing private/service-only tables have informational no-policy notices. Existing leaked-password-protection warning remains: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

## Deployment constraints and remaining work

Do not merge this branch into the shared-beta deployment branch before coordinating schemas and server functions. Shared beta uses the production account database; it does not have these migrations. Deploying the new frontend alone there would leave age confirmation unavailable. Production schema/server changes remain gated for release.

- Browser acceptance and deployment of the updated server handlers remain pending. Node tests and SQL tests are not live browser acceptance.
- Full device-local history/profile/progress, offline AI alternatives, sync consent/migration, export/import and conflict handling remain unfinished. No cosmetic sync checkbox has been added; current ledger still requires cloud entries for AI analysis.
- Lifetime-member cash reserve/redemption, swag and maintenance redemption, actual affiliate transfers/debits and audit workflow remain unfinished. Do not activate or advertise these as operational.
- Cash payout cadence/minimum, reserve release policy and referred lifetime-purchaser second-payment rules need resolution before enabling those cash flows. Existing affiliate payout settings do not implicitly apply to ordinary member rewards.
- Diagnostic retention/purge scheduling, owner aggregate reporting and browser/provider verification remain before production activation.
- Gemini/Claude keys and live acceptance, physical Android Back, remaining release checklist and legal review remain open.
