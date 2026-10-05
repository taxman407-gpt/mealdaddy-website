# MealDaddy launch runbook

## Internal AI review

See [AI_TEAM.md](AI_TEAM.md) for the internal diet-coach roles, dedicated diet test users, truthful AI attribution requirements, and owner decisions awaiting implementation. The Low Inflammation AI Coach reviews development and tests; it is not a credentialed human adviser or an automatically exposed customer persona.

## Security release gate

The [security team charter](AI_TEAM.md#security-team) defines review responsibilities, required coverage, and evidence. Role definitions do not establish that monitoring or testing is running.

- Security corrections take priority over features, appearance, growth, and cost optimization. Follow the [immediate escalation procedure](AI_TEAM.md#security-priority-and-immediate-escalation) as soon as the team cannot safely correct or verify an issue; do not wait for release review. Notify the owner immediately about suspected active exploitation, exposed secrets, or customer-data exposure as well.
- An escalation includes impact and uncertainty, the blocker, containment, proposed correction, responsible role, outside assistance or owner decisions needed, verification/recovery steps, and a timeline or next update point. Continue authorized remediation while awaiting the needed decision; distinguish a local fix from a verified production correction.
- Record the current candidate commit, artifact digest, migration/configuration versions, and test environment; the historical release marker below is not evidence for a newer candidate.
- Confirm isolated staging services and credentials before authenticated, adversarial, billing, upload, deletion, or recovery tests. Use synthetic accounts and Stripe test mode. A separate frontend URL sharing production data is insufficient.
- Run local checks, then execute applicable staging tests with anonymous access, two unrelated members, and a separate test administrator. Verify account isolation through direct API/database/storage access, not only through the UI. Passing source-text assertions does not demonstrate deployed enforcement.
- Attach redacted test results, actual platform coverage, findings, retests, residual risks, and untested scenarios to the candidate. Include AI-input abuse, payment/retry behavior, data retention/sync, and backup/restore coverage.
- Block release on required test failures or gaps, unresolved critical/high findings, account-isolation failures, authentication bypasses, exposed secrets, or unverified staging isolation. Obtain the security lead's recommendation and owner approval of the complete candidate.
- Promote the approved artifact with recorded environment-specific configuration and database compatibility. Retest affected areas after changes. Scope production smoke checks separately and keep them non-disruptive.
- Arrange an owner-approved independent human penetration-test engagement before broad promotion/native-store launch. Native iOS/Android releases require tests of those actual builds.

## Release candidate

- Release marker: `20260812-1`
- Production changes remain unapplied until the migration, Edge Functions, and Worker are approved together.
- Never test deletion with the owner's account or a real customer account.

## Automated acceptance

1. `pnpm test`
2. `pnpm run build`
3. Confirm `dist/` has no `server/`, `supabase/`, repository metadata, or deployment configuration.
4. Syntax-parse every Edge Function included in the candidate.
5. Verify that the linked Supabase project is the intended isolated staging project before running `supabase db push --linked --dry-run --include-all`; confirm only intended migrations appear. Review production migration plans separately as part of release approval.

## Safe two-account acceptance

Use a Stripe test-mode Core account and a separate Complimentary Family Access test account. Do not reuse the owner account.

- Sign in, sign out, email verification, password recovery, and other-session invalidation.
- Finish onboarding in under five minutes with multiple goals, a low-carb limit, an inflammation concern, and a weight goal.
- Log text, camera, gallery, voice, label photo, combined meal/beverage, and backdated entries.
- Verify selected meal type remains stable; retry a deliberately failed estimate.
- Verify label evidence is deterministic, before/after leftovers work, and saved favorites reuse stored values.
- Verify nutrition drill-down, net-carb reconciliation, hydration calories, meal impact, and inflammation wording.
- Verify weekly/monthly/annual reports, valid-day averages, partial-day notice, weight comparison, print, and download.
- Verify Restaurant Mode permission denial, manual search, A/B/C choices, and saved substitutions.
- In Stripe test mode, verify duplicate Checkout attempts are rejected and cancellation opens the billing portal.
- Export JSON/CSV and confirm formula-leading text is neutralized before opening it in spreadsheet software.
- Delete only a disposable test account after re-entering its password; verify billing stopped and sign-in no longer works.

## Vendor-dashboard decisions requiring owner approval

- Supabase: enable Turnstile/CAPTCHA, leaked-password protection, email confirmation, appropriate Auth rate limits, MFA enrollment for owner accounts, storage MIME/size quotas, backups/PITR, and restore testing.
- Stripe: confirm live/test separation, one-active-subscription behavior, Radar trial-abuse rules, trial/card reuse policy, webhook event allowlist, portal cancellation behavior, tax settings, and owner MFA.
- OpenAI: set the global provider budget and alerts at 25/50/75/100 percent; restrict allowed models and keys; document emergency ownership.
- Cloudflare/GitHub: owner MFA, least-privilege tokens, branch protection, preview protection, secret scanning, and rollback ownership.

## Commercial email compliance gate

Do not send the first product-news, recipe, promotional, or re-engagement campaign until every item below is verified in the actual sending service and approved by counsel. Transactional account, security, billing, and password-reset messages must remain operationally separate from marketing campaigns.

- Setup clearly discloses that finishing setup activates occasional optional email updates and identifies where the member can opt out.
- The preference record preserves the signup source and timestamp. Editing setup later must never resubscribe a member who previously opted out.
- Every marketing audience query requires `opted_in = true`; unsubscribed and bounced addresses are kept on a suppression list and excluded from every campaign and vendor export.
- Every marketing email uses accurate From, To, Reply-To, routing information, and a subject that accurately describes the message.
- The message clearly identifies MealDaddy and identifies promotional content as advertising when required.
- Every marketing email includes MealDaddy's valid physical postal address and a clear, conspicuous unsubscribe link.
- Unsubscribe takes no more than one simple webpage or reply-email action, requires no login or fee, works for at least 30 days after sending, and stops all MealDaddy marketing email immediately (never later than 10 business days).
- A member can also unsubscribe from Profile & Account. Unsubscribing does not block essential account, security, billing, or password-reset messages.
- Suppressed addresses are not sold, transferred, re-imported, or resubscribed except when a member knowingly requests optional updates again. Transfers solely needed for a contracted compliance provider require appropriate controls.
- Test unsubscribe end to end before every provider or template change. Keep auditable records of disclosure wording, preference changes, campaigns, suppression, bounces, and complaints.
- Review the email vendor's authentication, complaint, bounce, and suppression behavior. MealDaddy remains responsible for campaigns sent on its behalf.
- Limit the initial program to United States recipients. Do not send marketing email to other countries until counsel approves country-specific consent and privacy handling.
- Recheck federal and applicable state requirements with qualified counsel before broad promotion and after material changes to the program.

## Initial enforced application limits

- Trial: $0.50 total, 30 AI calls per UTC day, one in-flight request.
- Core: $3.00 per UTC month, 50 AI calls per UTC day, one in-flight request.
- `past_due`: no new paid AI calls.
- Global pause: set `public.ai_runtime_control.ai_enabled` to false while leaving logging available.

## Go/no-go

Broad promotion remains **no-go** until counsel approves the legal drafts, vendor-dashboard controls are recorded, the two-account test passes, and the production release is smoke-tested on mobile Chrome, installed PWA, and desktop Chrome.
