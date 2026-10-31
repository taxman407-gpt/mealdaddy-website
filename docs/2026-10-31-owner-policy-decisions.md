# Owner policy decisions — October 31, 2026

These decisions supersede conflicting unresolved-policy entries in the October 25 morning handoff and release matrix. This records policy only; it does not activate billing, payouts, rewards or production changes.

## Subscriber referral credit

- Referral credits have no cash value and are redeemable only toward eligible MealDaddy offerings. They cannot be cashed out or redeemed for money. Apply this wording consistently to referral screens, reward balances, onboarding and program terms when implementing the program.
- $5 credit per verified referred customer, awarded once after the second qualifying payment (supersedes first-payment award).
- Credits accumulate and carry forward; redeem toward future monthly memberships, future swag when implemented, and up to 50% of annual maintenance fees.
- Existing $5/month membership redemption cap remains unchanged.
- Implementation and integrated reconciliation tests remain pending.
- Clarification remains for lifetime purchases: a lifetime purchase usually has only one initial payment. Do not invent an exception or count a free trial, duplicate webhook, or failed payment as a second qualifying payment. Determine whether a later maintenance payment qualifies or the owner wants an explicit lifetime exception before implementing that case.

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

## Local storage decision remains open

Current main meal history, profile and progress use account database storage. Device-only favorites, drafts and API keys do not implement full local history or offline lifetime use.

Owner requested more information before deciding release timing. No deferral was approved. Explain device storage versus cloud sync, migration and backup/recovery, multi-device tradeoffs, and the distinction between offline access to stored data and online AI analysis. Preserve existing member records; no migration or deletion is authorized by this decision record.
