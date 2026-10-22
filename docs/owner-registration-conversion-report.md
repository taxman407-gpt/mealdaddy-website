# Owner Tools — Registration-to-Subscription Conversion Report
Status: Implemented on the October test branch; test database migration and synthetic checks pass. Production rollout and live payment reconciliation remain disabled.
Date: 2026-10-21

## Goal
Allow authorized MealDaddy owners to identify registered users who have not completed checkout, monitor conversion, and prepare compliant welcome/periodic communications.

## Location
Owner Tools > User Management > Registration & Conversion. Keep entry only on Account & Privacy, with the existing owner authorization and MFA requirement.

## Required fields
- Registered email; UTC registration date; email verification date/status
- Subscription plan, Stripe subscription status, trial start/end, renewal/end, cancellation state
- Distinguish no subscription, incomplete checkout, active trial, paid active, past_due, canceled, complimentary access, and unknown/reconciliation needed
- Stripe customer/session linkage and last checkout attempt (if present), but never payment card details
- Email communication preference: explicit opted in, opted out, or unknown/not recorded
- Date of most recent welcome email, if tracked; avoid duplicates
- Conversion summaries: registrations, verified registrations, started checkout, active trials, first successful payment, paid conversions, incomplete checkouts; conversion rate denominator labeled
- Filters for registration period, conversion status, email verification, and marketing opt-in; CSV export limited to authorized owner

## Security and source of truth
- Never expose auth.users, service-role credentials, or admin endpoints directly to the browser.
- Use a new server-side owner-only endpoint with immutable owner-ID check, current authenticated JWT, verified AAL2 MFA, and restrictive CORS. Do not rely on hidden buttons as authorization.
- Return only necessary columns. No password hashes, MFA factors, IP addresses, access tokens, payment details, or unrelated customer health data.
- Stripe payment status must be reconciled against verified Stripe events; absence of a Supabase subscription row means 'no linked subscription in database', not proof no Stripe payment occurred.
- Owner audit log for exports and privileged report access. CSV formula injection mitigation.
- Welcome/transactional messages are distinct from marketing emails; marketing messages require valid opt-in and unsubscribe handling. Do not send messages automatically until owner approves copy and sending policy.
- New enrollment notifications already exist independently; deduplicate against stable user ID, not just email.

## Acceptance tests
1. A verified registered user without a subscription is 'registered — no linked subscription', not 'paid'.
2. Active Stripe subscription appears as paid only after verified successful payment evidence; trialing does not count as paid conversion.
3. A failed/expired checkout is visible as incomplete, not paid.
4. Complimentary Family Access appears separately, not as paid.
5. No marketing opt-in record is displayed as 'unknown', not 'opted in'.
6. Non-owner or AAL1 sessions receive 403; MFA-enrolled owners at AAL2 succeed.
7. CSV export escapes spreadsheet formulas and excludes internal sensitive fields.
8. Pagination, filtering, and counts are correct; no duplicates for repeat webhooks.
9. Synthetic fixtures only on isolated test Supabase project dkirmzthyynogkkaacmj; no production data changes.

## Implementation evidence — 22 October 2026
- Server-only report projection exposes the listed enrollment/billing fields through an owner/MFA endpoint; client roles cannot query the projection or execute its report RPC.
- Date/status/verification/consent filters, 100-row UI pagination, matching-filter summaries, and current-page CSV export are implemented. CSV uses an explicit column allowlist and escapes formula prefixes.
- Every view/export must write an owner audit record before returning any rows.
- A positive-payment evidence collector runs only after verified Stripe webhooks, subscription/customer linkage, and succeeded PaymentIntent allocation checks, behind ENABLE_OWNER_CONVERSION_REPORT. It is source-only and disabled in test.
- Synthetic SQL tests cover registration, trial, unproven active membership, positive payment, repeated checkout rows, unknown consent, filters and pagination; transactions roll back.
- Trial start is explicitly not recorded; welcome sent time is now joined from the delivery ledger. Historical missing payment evidence remains unknown; no live customer data was inspected or backfilled.
- Report view deliberately uses a privileged narrow projection of auth.users, granted only to service_role. No auth.users table access is granted to client or service roles by this migration.
