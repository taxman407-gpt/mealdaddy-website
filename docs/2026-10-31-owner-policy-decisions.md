# Owner policy decisions — October 31, 2026

These decisions supersede conflicting unresolved-policy entries in the October 25 morning handoff and release matrix. This records policy only; it does not activate billing, payouts, rewards or production changes.

## Subscriber referral rewards

- $5 reward per verified referred customer, awarded once after that referred customer's second qualifying payment. Free trials, failed payments and duplicate webhook events do not count.
- Cash eligibility depends on the referring member's lifetime membership, not the referred customer's plan.
- Lifetime members may receive cash or MealDaddy swag credits. Cash payouts are capped at 80% of the current available referral reward balance, with the remaining 20% retained to help cover returns, refunds and voids. Example: a $100 available balance permits up to $80 cash, leaving $20.
- This lifetime-member cash exception supersedes the earlier blanket no-cash-value rule. Non-lifetime members receive credits only: those credits have no cash value and cannot be cashed out.
- MealDaddy credits accumulate and carry forward and are redeemable only toward eligible MealDaddy offerings: future monthly memberships (existing $5/month cap), future MealDaddy swag when implemented, and up to 50% of annual maintenance fees. Existing credit redemption permissions remain unchanged.
- Implementation must distinguish cash-eligible rewards from credit-only balances, prevent duplicate redemption, and reconcile returns/refunds/voids. The 20% reserve must not be emptied through repeated immediate withdrawals against the same earned balance; reserve release and payout-cycle details need definition before enabling cash payouts.
- The approved-affiliate commission program remains separate. Do not automatically apply its payout cadence, minimum or bank-debit rules to member referral cash payouts without a decision.
- Apply the differentiated cash/credit terms consistently to referral screens, reward balances, onboarding and program terms. Implementation and integrated reconciliation tests remain pending.
- Referred lifetime purchasers still normally make only one initial payment. No exception to the second qualifying payment requirement has been authorized for those purchases; whether a later maintenance payment qualifies remains unresolved.

## Affiliate payouts

- Payment method: bank transfer.
- Frequency: monthly.
- Minimum payout: $15.
- Refund waiting period: 14 days.
- Negative balances: owner directs recovery by debit from the same bank account used for transfers.
- Bank debit recovery requires a payment-provider-supported collection flow and appropriate affiliate authorization; a transfer destination alone does not establish debit authorization. Implementation, provider verification, agreement/onboarding and audit/idempotency tests remain pending. No bank debit or transfer is authorized for execution by this documentation update.
- Existing affiliate commission percentages remain unchanged.

## BYOK Founding sellout

Replace the $250 Founding lifetime offer with the $295 regular lifetime offer. Remove Founding wording; do not hide all lifetime purchasing. Older instructions to hide the offer mean the exhausted Founding offer, not its regular replacement. Reconcile storefront, checkout, disclosures and monitoring wording before release.

## Storage, diagnostic collection and no-sale commitment

Owner decision: retain cross-device history syncing, activated by a specific opt-in checkbox with an explanation. Retain the commitment that no user information is ever sold. Collect information for diagnostics with transparent, separate controls.

### Cloud-sync control

- Onboarding and Account & Privacy: unchecked by default for users without explicit consent.
- Checkbox: "Sync my MealDaddy history across my devices."
- Explanation: "Save my meal history, nutrition profile and progress in my protected MealDaddy account so I can access them on other devices. If this is off, these records stay on this device and need a backup before I clear browser data or replace the device."
- Turning this off must stop future optional history/profile uploads. It must not silently delete existing cloud or local records. Explain existing cloud retention and provide a separate removal action.
- Account authentication, membership/billing and essential security records are distinct from optional meal-history syncing and must be disclosed. AI requests still send the content required for the selected analysis even with sync off.
- Existing users require a migration/consent flow that preserves their records. Do not infer explicit consent from historical cloud storage or silently migrate/delete data.
- Main history/profile/progress currently use account database storage. Full local persistence, export/import and offline support must work before enabling this checkbox or claiming that unchecked means device-only. A cosmetic checkbox that leaves uploads running is not acceptable.
- No deferral of the local/offline requirement was authorized.

### Separate optional diagnostics control

Implementation design: a separate unchecked checkbox, independent of sync and membership, labeled "Share optional diagnostics to help improve MealDaddy."
Explanation: "Send technical error reports, app/browser version, performance measurements and feature-use counts to help us find bugs and improve reliability. Optional diagnostics do not include meal descriptions, photos, health details, passwords, API keys or payment details. You can turn this off at any time."

- Collect minimal diagnostic fields; do not capture raw request/response bodies or unsanitized logs that could contain personal information or credentials.
- Use aggregate reporting where practical. Do not call pseudonymous or account-linked diagnostics anonymous.
- Gate optional diagnostic collection at its source on the current saved choice. Disabling it stops future optional reports and discards unsent optional diagnostic events.
- Disclose essential operational/security records separately rather than implying all logging can be disabled. Define actual fields, access, retention and deletion before release.
- Diagnostics consent does not authorize marketing use or unrestricted inspection of meal/health records.

### No-sale wording

"MealDaddy never sells your personal information. We use information to provide the service and, with your permission, collect optional diagnostics to improve reliability. Service providers process information needed to operate MealDaddy; that is explained in our Privacy Policy."

Apply the commitment consistently to onboarding, Account & Privacy, diagnostic explanations and the Privacy Policy. Describe service-provider processing truthfully; do not promise that information never leaves the device or is never processed by another company.

Status: decisions and acceptance requirements recorded; functional controls, local storage, consent migration and diagnostic pipeline verification remain implementation work. No production data or collection settings changed by this record.
