# Shared-account verification — 2026-11-08

## Outcome

The deployed production and October private-beta clients both point to the production Supabase project already referenced in `app/supabase-client.js`. The separate October test project is not the backend used by the live private-beta client. No database merge, account migration, or Cloudflare configuration change was required or performed.

A defect in beta-to-family conversion was corrected in the live production database: a previous BYOK `plan_key` could survive the transition to family access. Migration `20261108180425_normalize_family_plan_when_converting_beta_access.sql` now explicitly selects `core` when family access is granted, retaining the existing authentication user ID and all application records. This migration has already been applied; its inclusion here records the applied version.

## Live deployment checks

GitHub Actions run `42508192973` completed successfully for commit `965bb4e060ef9b1c5ee463059158d42577ba0480`.

The read-only workflow verified:

- The production and beta clients are available on their intended hosts and use the same production project.
- The deployed beta client includes the invitation gate, beta-only function namespace, and billing restrictions.
- The beta Worker's supported `/health` endpoint reports shared accounts and disabled billing.
- The authentication settings endpoint responds successfully using each site's public client configuration.
- Anonymous requests cannot read ledger records; beta API calls without authentication are denied.
- Beta API CORS preflight requests succeed for both origins.

An initial diagnostic failed because it requested `/beta-build.json`, which `worker.beta.js` deliberately blocks. The verification was corrected to use the supported `/health` endpoint; no application route was opened to accommodate the test.

## Database regression checks

Direct database tests ran in rollback-only subtransactions. They temporarily exercised existing verified family accounts and a synthetic ledger fixture; no fixture, invitation, entitlement, or audit-event changes from those tests persisted.

The post-migration checks passed:

- A family member can be approved for beta and accept the invitation without modifying the existing family grant.
- A BYOK beta entitlement can become active Standard/core family access on the same user ID.
- Accepting beta again does not overwrite family access.
- Revoking the beta invitation after family conversion does not revoke family access.
- Simulated authenticated database roles can read and edit their own ledger entry, but cannot read, edit, or reassign another user's entry.
- Before/after fingerprints match for the complete ledger, profiles, saved foods, saved recipes, weight entries, and storage-object metadata. Authentication user IDs are unchanged.
- Anonymous and authenticated client roles cannot directly execute the administrative family-access function.

These role simulations verify database policies. They are not browser logins or evidence that an email-recovery flow completed.

## Operational guidance

Existing users must use their existing MealDaddy account, not create a second account for beta. Beta invitations remain individually approved; this audit did not permanently invite or convert any user. A new approved tester uses the same production authentication directory and may later receive family access on that existing user ID. Different web origins may require separate sign-ins despite sharing the same account and stored records.

Shared data also means an intentional edit or deletion in one interface affects the same record used by the other. This audit did not create a full backup or change backup settings. The separate test database was left untouched.

## Remaining release checks

No authenticated browser session was available to this audit. Actual browser sign-in, password-reset email delivery and completion, and a save/reload/edit round trip between the two interfaces still need end-to-end verification.

The latest previously inspected full October branch test run, `41700438319` from 2026-11-03, built successfully but stopped in `tests/release-cache-consistency.mjs`: the test expected `app/auth.html` to reference `./auth.js?v=20261023-1`. This existing release-cache consistency failure was not changed or resolved as part of the shared-database fix. The passing deployment audit is not a full-suite or whole-beta release signoff.

The change in this branch does not deploy a frontend, change billing configuration, alter owner permissions, or modify authentication settings.
