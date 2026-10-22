# Automated verified-registration welcome email — October upgrade
Status: approved feature request; implementation pending.

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
