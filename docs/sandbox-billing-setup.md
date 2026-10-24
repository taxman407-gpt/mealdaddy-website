# Sandbox billing setup — October 24, 2026

Stripe account: acct_1TxzSmCVOk0M72Mf (MealDaddy.AI sandbox, livemode false).
Supabase project: dkirmzthyynogkkaacmj (isolated development only).
Production egbieqvbwniaxgqjzqkp and the shared-account private beta are not payment-test destinations.

Deployed version 1:
- sandbox-create-checkout, JWT verification enabled plus application user authentication.
- sandbox-stripe-webhook, Stripe signature authentication; JWT gateway disabled for Stripe delivery.

Stripe endpoint we_1UUE4QCVOk0M72Mfgsw6EtJ6 targets https://dkirmzthyynogkkaacmj.supabase.co/functions/v1/sandbox-stripe-webhook with API version 2026-08-26.dahlia. Subscribed events cover checkout completion/asynchronous results/expiry, subscription lifecycle, invoices and refunds. No live endpoint was changed.

Monthly sandbox prices already existed and were verified:
- Standard: price_1TxzpVCVOk0M72MfW3qHZe2O, USD 9.99/month.
- BYOK: price_1TxzqGCVOk0M72MfxFVlLb2S, USD 6.99/month.

## Required secure setup
In the isolated project's Edge Functions secret settings, install:
- SANDBOX_STRIPE_SECRET_KEY: sandbox API credential, preferably a restricted rk_test_ key with the required integration permissions.
- SANDBOX_STRIPE_WEBHOOK_SECRET: signing secret from the Stripe endpoint above (whsec_ prefix).

Do not put either value in chat, source, documentation, or a committed environment file. The Supabase connector has no secret-write operation. Credential entry is still pending; no successful payment acceptance is claimed.

Packaging uses dedicated sandbox variable names, hard-codes the isolated project/origin and verified monthly price IDs, rejects live keys and signed livemode events, and keeps lifetime/referral/report activation disabled. The ordinary beta checkout UI remains disabled. Lifetime catalog/configuration and separate synthetic test-account checkout UI/harness still require completion.

Validation: full npm test passed including new isolation tests. Live unauthenticated checkout returned 401. Live sandbox webhook returned 503 with a missing sandbox credential message. These prove fail-closed configuration, not end-to-end payment fulfillment. Next: secure credential entry, synthetic test identity, actual test checkout, signed fulfillment, replay and cancellation checks.

Sources: https://supabase.com/docs/guides/functions/secrets and https://docs.stripe.com/products-prices/manage-prices .

## Lifetime sandbox catalog prepared

Created sandbox-only one-time prices, both verified livemode=false:
- Standard Founding Lifetime USD 350: price_1UUEG1CVOk0M72MfIafG1Vx2.
- BYOK Founding Lifetime USD 250: price_1UUEG4CVOk0M72MfYQ3HL6ue.

Added sandbox-create-license-checkout and enabled lifetime handling only inside the isolated sandbox packages. Monthly checkout and webhook were redeployed with this configuration. This supersedes the earlier disabled-lifetime packaging note; referrals/report activation stay disabled. Maintenance and sold-out replacement prices are not configured. No lifetime payment or entitlement was created. The shared beta checkout remains disabled. Both secure credentials and end-to-end payment acceptance are still pending.

## Database acceptance verified

Executed the lifetime and founding-capacity SQL acceptance suites against dkirmzthyynogkkaacmj in rollback-only transactions. Updated the older fixtures to reserve a checkout quote before fulfillment and reflect the separate, always-visible plan counters. Passed duplicate-payment/refund protection, reactivation without back fees, cross-account and forged-access rejection, independent plan capacity, 201/200 near-limit boundary, reservation expiry, overselling rejection and sticky sellout. Verified zero remaining synthetic lifetime identities after rollback. These are database tests, not Stripe payment acceptance or actual production availability.
