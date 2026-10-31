# Shared-account beta rollout — October 31, 2026

Owner confirmed that testers retain their existing accounts and history. The tester-facing Worker must continue using project `egbieqvbwniaxgqjzqkp`. Project `dkirmzthyynogkkaacmj` remains a disposable development/test environment; it is not a replacement user database or an additional product database.

## Completed

- Reviewed existing shared-project schema and deployed function inventory. Existing referral RPC signatures match the update, including the legacy receipt wrapper. Both referral programs were disabled and remain disabled.
- Installed the four previously isolated-tested migrations in the shared project. These add adult self-attestation and optional diagnostics tables and update the dormant referral reward logic. No meal/profile/auth tables, live Edge Function names, payment configuration or email activation flags were changed.
- Shared migration versions: `20261031184605` referral_second_payment; `20261031184606` optional_diagnostics_consent; `20261031184617` adult_eligibility; `20261031184618` diagnostic_feature_names. These correspond to the four October 31 source migrations. The first adult migration attempt collided with a tool-generated version timestamp and rolled back; confirmed the table was absent before applying successfully. Do not reapply source filenames blindly: reconcile these recorded versions first.
- Before/after aggregate verification: 6 accounts and 400 meal entries, unchanged. No existing records migrated or deleted. Zero diagnostic opt-ins/events.
- All three new public tables have RLS and account-scoped policies. Security advisor returned no findings against the new tables; existing server/private-table informational notices and the existing leaked-password-protection warning remain.
- Fixed the stale v97 assertion in `tests/security-hardening.mjs`; the application already uses v98. Full Node suite now exits successfully. Build and private-beta packaging also pass.

## Deployment checkpoint

The frontend and beta Edge Functions have NOT been updated in this pass. Cloudflare in the connected browser is at sign-in. Hold age-enforcing beta functions until the matching frontend is ready; otherwise current testers cannot confirm adulthood in the old UI.

Prepared assets are `dist-beta`, using shared accounts, invitation gating, beta-prefixed APIs and disabled checkout. Never deploy `dist-test` to the tester-facing Worker: that bundle uses the isolated database and sample fixtures.

After Cloudflare sign-in:

1. Publish the approved branch checkpoint to the test Worker only with `wrangler.beta.jsonc`; confirm its build is `npm run build && node scripts/build-private-beta.mjs`.
2. Deploy the matching beta-prefixed AI functions and `beta-manage-referrals` from `scripts/package-beta-functions.mjs`. Coordinate this with the frontend; do not update production function names, Stripe webhooks or checkout endpoints.
3. Run `npm run test:beta-deployment` against the fresh build (39 asset checks), verify shared-account health, and verify the adult-confirmation and default-off diagnostics UI. Do not record an age attestation on a user's behalf without authorization.
4. Verify authenticated/provider behavior with authorized disposable fixtures and perform the separately required physical Android tests.

If rollout fails, restore the prior beta frontend and beta function versions together. Leave additive tables and retained data in place; do not destructively roll back accounts or history. Referral programs, cash payouts, automated emails and live payment changes remain off.

## Still unfinished

This removes the database mismatch, not the remaining release work. Local/offline history and opt-in sync migration, diagnostic retention/reporting, reward cash/swag/maintenance redemption, affiliate transfer/debit operations, provider acceptance and the broader release checklist remain open. Production website release still requires owner review and approval.
