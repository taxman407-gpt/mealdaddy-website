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

## Local storage decision remains open

Current main meal history, profile and progress use account database storage. Device-only favorites, drafts and API keys do not implement full local history or offline lifetime use.

Owner requested more information before deciding release timing. No deferral was approved. Explain device storage versus cloud sync, migration and backup/recovery, multi-device tradeoffs, and the distinction between offline access to stored data and online AI analysis. Preserve existing member records; no migration or deletion is authorized by this decision record.
