# Morning handoff — October 25, 2026

The full scope is tracked in [the release matrix](october-2026-release-matrix.md). The release is not complete; this handoff separates completed changes from work intentionally left open.

## Completed in this pass

- Added owner/MFA-protected, paginated affiliate commission review: adjusted commission, recorded paid amounts, rates, receipt references and signed balance. It does not execute payouts. Deployed the API only to the isolated project as `manage-referrals` v9. Anonymous access returned HTTP 401; synthetic owner/MFA and pagination tests passed.
- Reconciled advertised monthly/lifetime/maintenance amounts against checkout policy. Preserved the later $42 BYOK maintenance change and all other current prices; changed no Stripe prices. Corrected outdated $36 checklist text and Standard storefront naming.
- Updated draft Terms and Privacy facts for BYOK, three providers, maintenance, affiliate/referral terms, request-time key transmission, and the actual account-storage architecture. Kept legal-review status and clearly disclosed the unfinished local functionality.
- Fixed a billing safeguard: maintenance checkout is rejected during the first three included years, before Stripe access. Hidden the renewal control during that period. Exact anniversary and leap-day tests passed. Deployed the isolated sandbox checkout as v9; no checkout/payment was created.
- Changed saved-food defaults to device-only for users without an explicit preference. Existing cloud/device/one-time choices are preserved. Blocked preference storage does not silently select cloud.
- Expanded beta deployment verification from 23 app assets to 36 app/business/legal assets. This caught the beta worker blocking extensionless Terms/Privacy redirects; fixed the exact legal-document routes while preserving private-path and host restrictions.
- Full automated regression suite and build passed during this work. Deployment hashes are checked separately; successful local tests are not represented as live acceptance.

## Parked for decisions or separate implementation

- Subscriber referral points awarded and cents-per-point conversion are still unset. No values were invented and the program was not enabled.
- Affiliate payout cadence, method, minimum and refund hold remain undecided. Commission accrual/reporting is implemented; payout execution and audited recording are not a complete operational workflow.
- BYOK sellout policy conflicts: the older monitor says hide the offer; later source implements a $295 regular lifetime replacement. Preserve existing behavior until reconciled.
- Main meal history, profile and progress still use the account database. Full device-local storage/offline lifetime functionality needs a storage abstraction, local persistence and migration, backup/import, and transient AI interfaces. Device-only favorites are not a substitute. No existing customer data was migrated or deleted.
- Shared beta referral API/UI integration, sandbox affiliate discounts/refunds, maintenance billing and final live recipe/photo acceptance remain open. Do not use real customer data to close these gates.
- Physical Android Back remains a device check. Live Gemini/Claude acceptance remains deferred.
- Owner activation is still required for production deployment, welcome sending, referral programs and billing changes. Production was not activated; no money moved or promotion launched.

## Continue next

1. Confirm the newest beta deployment matches all 36 public files and verify the owner commission page against isolated fixtures.
2. Resolve the three business-policy decisions above, then implement the payout/reward operational steps with audit/idempotency controls.
3. Implement the local-first architecture as an explicit workstream rather than claiming it through UI wording.
4. Complete the remaining sandbox/provider/device acceptance and production rollout/rollback review.
