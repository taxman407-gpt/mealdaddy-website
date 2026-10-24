# Beta acceptance checkpoint — October 24, 2026

The current test hostname serves the private beta with shared MealDaddy identities, not the retired isolated fixture environment. Use `npm run build`, `node scripts/build-private-beta.mjs`, then `npm run test:beta-deployment` for public asset verification. The older `test:deployment` command intentionally checks the separate fixture build and is not a beta readiness check.

Verified this session:
- Full repository regression suite passed (exit 0).
- Build and private-beta packaging passed.
- Eleven deployed authentication, app, BYOK and draft assets matched the local build byte for byte.
- Public beta health reports shared accounts, beta API namespace and disabled billing.
- Connected browser rendered the actual beta sign-in page with complimentary invitation-only access instructions.

Still blocked or unverified:
- Browser is at sign-in; Steve must complete his login and MFA before the authenticated walkthrough can continue. No password or account credential was read or changed.
- Real provider calls remain unverified. The prior preparation report requires dedicated sponsor credentials/model choices and spending activation, or an explicitly selected personal BYOK connection. The public health readiness label is static configuration, not proof of current secret presence.
- Stripe sandbox checkout/webhooks and email delivery acceptance remain separate pending integrations. Beta checkout is intentionally disabled.
- Android hardware Back behavior requires device acceptance.

No full-app readiness claim, provider call, customer record change, production deployment or billing activation was made in this checkpoint.

## Authenticated Edge walkthrough — October 24

- Steve completed sign-in. The actual private beta loaded the Log and More screens.
- Account & Privacy confirmed the session had completed two-step verification; Owner Tools loaded successfully.
- The owner beta invitation was approved. Sponsor controls loaded with spending disabled, 20 requests per tester/day, 50 globally/day, 200 total, and zero sponsor requests recorded.
- More → Beta AI connection had no source selected in this browser.
- Live AI acceptance is blocked pending an explicit funded connection. Secret presence was not inspected, and no provider request, spending activation, or meal-record mutation was performed.
- Left the authenticated browser on More for connection setup. This supersedes the sign-in blocker above, but not the outstanding provider, payment, email, or Android acceptance checks.

## OpenAI acceptance — October 24

- Published explicit OpenAI selection in commit 2768915157c67cb6fef5e081bf372103cd4fb08e; six beta function deployments are version 4. Production function names were not deployed.
- All eleven deployed beta assets matched; the full regression suite and new entitlement/invitation/cost-limit checks passed.
- In Steve's authenticated Edge session, selected OpenAI using the existing Standard allowance. A real kitchen-planning request returned a two-ingredient egg/olive-oil suggestion without adding a ledger entry.
- Reload preserved `hosted_openai`. At 390 CSS pixels, the selected option and status were readable without horizontal overflow; see beta-openai-phone.png. Restored the normal viewport afterward.
- This confirms real text guidance, not photo-analysis/correction/save acceptance or Android hardware testing. Nutrition accuracy remains a separate check: the response estimated 220–240 kcal for two large eggs plus one tablespoon olive oil, which appears understated and needs review.
