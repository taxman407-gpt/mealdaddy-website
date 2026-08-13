# MealDaddy launch runbook

## Release candidate

- Release marker: `20260812-1`
- Production changes remain unapplied until the migration, Edge Functions, and Worker are approved together.
- Never test deletion with the owner's account or a real customer account.

## Automated acceptance

1. `pnpm test`
2. `pnpm run build`
3. Confirm `dist/` has no `server/`, `supabase/`, repository metadata, or deployment configuration.
4. Syntax-parse all ten Edge Functions.
5. Run `supabase db push --linked --dry-run --include-all` and confirm only the intended migration appears.

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

## Initial enforced application limits

- Trial: $0.50 total, 30 AI calls per UTC day, one in-flight request.
- Core: $3.00 per UTC month, 50 AI calls per UTC day, one in-flight request.
- `past_due`: no new paid AI calls.
- Global pause: set `public.ai_runtime_control.ai_enabled` to false while leaving logging available.

## Go/no-go

Broad promotion remains **no-go** until counsel approves the legal drafts, vendor-dashboard controls are recorded, the two-account test passes, and the production release is smoke-tested on mobile Chrome, installed PWA, and desktop Chrome.
