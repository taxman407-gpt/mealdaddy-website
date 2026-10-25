# Automated verified-registration welcome email — October upgrade
Status: Implemented and deployed in the isolated test project with sending disabled. Synthetic SQL and worker/runtime checks pass.

## Trigger
Send exactly one welcome email after successful email verification of a newly registered MealDaddy account. Do not trigger merely on sign-up form submission, checkout attempt, or repeat sign-in. Historical users must not be bulk-mailed on feature activation.

## Delivery architecture
- Verified Supabase Auth event or authenticated server-side enrollment event, delivered through a transactional email provider.
- Dedicated server-side welcome_email_deliveries ledger: user ID, template version, event ID, status, attempts, provider message ID, sent timestamp; unique idempotency key per user/template purpose.
- Transactional outbox with bounded retries, exponential backoff, delivery status monitoring and owner-visible failure alerts.
- Do not use the owner's personal Gmail credentials or expose provider keys to the browser.
- Keep the welcome email strictly onboarding-related; newsletters, promotions, and periodic updates require separately recorded consent and unsubscribe handling.
- Exclude secrets, health information, personal meal logs, subscription claims, and unverified membership status from email.
- Validate the sign-in URL and sending domain. Configure SPF, DKIM, DMARC and sender reputation before enabling.
- Feature flag defaults OFF in test and production; require test provider credentials, verified sender domain and explicit owner signoff before activation.

## Draft
Subject: Welcome to MealDaddy™ — Let's Get Started!
Welcome to MealDaddy! We're glad you're here.
Complete your profile, log your first meal (description or photo), explore your nutrition and hydration dashboard, and save favorite foods.
Sign in: https://www.mealdaddy.ai/app/auth.html
MealDaddy Team.
General wellness guidance; not medical advice.

## Acceptance
- One verified new user -> one delivery.
- Repeated verification webhook -> no duplicate delivery.
- Unverified account -> no delivery.
- Existing users at launch -> no retroactive sends.
- Email delivery failure -> retry without duplicate successful sends.
- Account deletion and opt-out policy honored; marketing opt-out does not block necessary transactional notices.
- No sending in isolated test without test credentials and synthetic addresses.

## Implementation — 22 October 2026
Auth verification inserts one outbox record per stable user ID, only for accounts registered after the enabled program cutoff. Repeated sign-ins/verification cannot create another record. Account deletion cascades the pending record.

The service-only processor claims one row with a five-minute lease, freezes the message payload before sending, and uses a stable provider idempotency key. It retries at most six times with exponential backoff. Ambiguous deliveries stop for owner review within 23 hours, before Resend's documented 24-hour key window expires. A successfully recorded send is never claimed again. A delivery accepted by the provider but not committed locally requires reconciliation; this is not an unconditional exactly-once transport guarantee.

The Resend adapter is optional source code, not a provisioned account. No credentials were configured, domains verified, cron created, or messages sent. The isolated project refuses recipients other than Resend's documented delivered@resend.dev test sink. Activation still requires verified sender/SPF/DKIM/DMARC, provider test credentials, approved copy/sending policy, server ENABLE_WELCOME_EMAIL=true, database settings.enabled=true with started_at set to activation time, and an authenticated service scheduler. Do not reset failed/uncertain deliveries to resend after the idempotency window; reconcile the provider message first.

Owner report monitoring shows failed/review-required deliveries and sent timestamps through the same owner+MFA authorization and access audit. Trial start remains unknown where not recorded.

Provider references: https://resend.com/changelog/idempotency-keys and https://resend.com/docs/dashboard/emails/send-test-emails . Stripe Directory documentation lookup was unavailable; its CLI was not retried after the earlier telemetry approval rejection. No vendor purchase or provisioning occurred.

The connector recovered when the migration was split into outbox and report-column migrations: 20261022223106 and 20261022223111. Installed SQL acceptance passed with all fixtures rolled back. process-welcome-email v1 and welcome-aware owner-conversion-report v2 are deployed with JWT checks. Verified database defaults: enabled=false, started_at=null, zero delivery records. No cron or credentials were configured and no message was sent.

## Owner editor — October 24
Owner Tools → Welcome Email provides subject/body editing, plain-text preview, Save draft, and a separate action to activate the saved draft. Only {{signInUrl}} is substituted. Drafts and publication revisions are audited, with optimistic revision checks to reject stale overwrites. Beta templates use a separate channel; beta activation never alters production content or enables delivery. New outbox records snapshot the active live template, while legacy records retain the original default. The processor uses this frozen snapshot for idempotent retries.

Verified sending still requires a configured sender/provider and scheduler. This editor does not send email or change delivery activation.

## Scheduler prepared — October 25

`.github/workflows/welcome-delivery.yml` supplies the previously missing scheduler. It runs only from `main` and only when the repository variable `WELCOME_EMAIL_SCHEDULER_ENABLED` is exactly `true`. It is inert on the October test branch. The protected GitHub environment is `welcome-email-production`; its `WELCOME_SERVICE_ROLE_KEY` secret must be configured directly in GitHub, never in source or chat. No secret or enablement variable was configured during preparation.

The scheduled job calls the existing production worker every five minutes, offset from the hour. Each run processes at most five deliveries sequentially, stops on an empty/disabled queue or any error, blocks redirects, times out requests, and never prints payloads, recipients, credentials or provider response bodies. There is no immediate scheduler retry of an ambiguous send; the outbox controls retry timing and idempotency. GitHub concurrency prevents overlapping scheduler runs; database leases cover other authorized invocations. GitHub scheduling is best-effort and can be delayed; this is not an immediate delivery SLA.

Activation order:
1. Sign in to Resend, verify the selected sending domain and configure the sender authentication records. Create a sending-only provider key and enter it directly into Supabase secrets. Never paste credentials in chat.
2. Complete delivery acceptance using the isolated development project and only `delivered@resend.dev`. Use a synthetic verified test account; confirm the frozen template and repeat-invocation behavior. Do not enable production as a test shortcut.
3. As part of the approved production release, deploy the snapshot-aware worker, merge the approved code, configure the protected GitHub environment secret, and verify the active welcome copy and sender.
4. With explicit owner activation approval, enable the server flag and database settings with a fresh activation cutoff, then set the repository scheduler variable to `true`. Existing registrations must remain excluded.
5. Inspect the first run and owner delivery status. To pause, set the repository variable to `false` and disable the server/database delivery flags. Do not reset uncertain deliveries after the provider idempotency window.

Preparation verified the isolated database currently has Vault but no pg_cron/pg_net installed. The GitHub scheduler avoids introducing those database extensions or putting a service credential into a database HTTP request queue. No production configuration was changed and no email was sent.

References: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule and https://supabase.com/docs/guides/functions/schedule-functions . Runtime regression tests cover disabled defaults, fixed destinations, bounded batches, stopped retries and sanitized errors.
