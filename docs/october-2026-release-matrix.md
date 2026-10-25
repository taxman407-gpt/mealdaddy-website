# October release: complete scope and remaining gates

Updated October 25, 2026. This is the whole-release checklist, not just meal-input acceptance. Historical checkpoint documents describe earlier states; this matrix distinguishes source implementation from live acceptance. Work stays on `feature/october-2026-upgrade`. No production activation, money movement, pricing change, or main merge is authorized by this checklist.

## Business model and operations

| Area | Implemented evidence | Remaining work / release gate |
|---|---|---|
| Monthly pricing | Canonical `membership-policy.mjs`: Standard $9.99, BYOK $6.99; checkout validates configured Stripe amount/currency/cadence | Confirm production price configuration at approved rollout; beta checkout stays disabled |
| Founding licenses | Standard $350, BYOK $250; separate 2,000-license allotments; aggregate availability and capacity SQL tests | Production release installation and real aggregate verification; test receipts never represent sales |
| Post-Founding pricing | Later branch commits ac896c5/dadd619 implement Standard $395 and BYOK $295 replacement offers | Reconcile older monitoring instruction to hide the BYOK offer with later replacement-offer behavior before rollout; do not silently choose one |
| Maintenance | Three years included; server now rejects maintenance checkout during that period and UI hides renewal; Year 4 Standard $60, BYOK $42; 60-day notice validation; optional renewal; reactivation without back fees | $42 is the later branch policy (e443f5a); older $36 notes are historical. Sandbox maintenance checkout, lapse/reactivation and partial-refund handling need integrated acceptance |
| Affiliate approval | Owner/MFA-protected apply/approve/reject flow; unapproved codes denied | Production program remains off; review agreement and onboarding process |
| Affiliate calculation | 15% of collected eligible net subscription receipts for first 12 months; 7.5% lifetime once; no maintenance commission | Integrated sandbox affiliate invoice/refund acceptance remains distinct from monthly/lifetime purchase tests |
| Commission review | Added owner/MFA-protected paginated ledger with adjusted commission, recorded paid amount and signed balance; no payout action | Isolated API deployed as manage-referrals v9 with JWT verification; authenticated owner UI acceptance remains. No actual affiliate records read during implementation |
| Affiliate payouts | Ledger contains recorded paid amounts; refunds can leave a negative balance for reconciliation | Payout method, cadence, minimum, refund hold and recording/approval process are not implemented as a complete workflow. Never treat displayed earnings as money sent |
| Subscriber referrals | One reward per referred customer's first qualifying collected payment; immutable promised conversion; invoice credit cap $5/month; replay/refund tests | Owner must choose points awarded and cents per point. Both remain unset; do not invent values or enable rewards |
| Referral discounts | Invoice-bound discount items preserve existing promotions; cancellation/release, partial credit and replay tests | End-to-end sandbox discount application and invoice/refund reconciliation |
| Billing | Prior isolated sandbox acceptance covered monthly/lifetime purchase, trial conversion, cancellation, refund and replay | Maintenance, referrals, discounts and production deployment/configuration are separate gates |
| Welcome email | Verified sender, isolated test-sink delivery, repeat invocation processed zero; modern-key authorization; disabled-by-default scheduler | Production credentials/configuration and explicit activation; real-inbox deliverability not established by test sink |
| Owner reporting | Owner/MFA-gated registration/payment evidence/export; processing counts/cost categories and commission review source | Full report UI acceptance and production rollout; never substitute subscription status for actual collected payment |
| Marketing consent | Transactional welcome is separate from marketing; consent checks exist | Newsletter/promotional sending remains outside this release activation; no promotion launched |

## Product, privacy and security

| Area | Implemented evidence | Remaining work / release gate |
|---|---|---|
| Meal correction | Same-row replacement, description authority, stale-write protection, preserved timestamp | Integrated real-provider correction/save in an authorized disposable account |
| Portion editing | All nutrient quantities scale once; manual source and composition score preserved; 0%-100% restoration tests | Physical Android acceptance; browser fixed-fixture test is not nutrition-model validation |
| Photos | Initial entry/multiple images, optional leftover photo, explicit suspected-item Add/Exclude/Correct, metadata stripping | Real Quick Log photo quality/uncertainty/save and leftover-image acceptance |
| Drafts/Back | Account-scoped text/photo drafts, desktop Back restoration, touched-input race guard | Actual Android hardware/gesture Back; no desktop emulation claim |
| Saved recipes | Preview-only recalculation; manual totals protected; server batch division and written-label overrides | Final live recipe-analysis acceptance; do not change Steve's existing favorites as fixtures |
| Restaurant mode | Menu-oriented guidance, substitutions, meal creation with photos, provider-specific search handling | Live menu/source and profile-substitution acceptance; unsupported provider search must remain explicit |
| Inflammation | Composition versus portion exposure; contributor explanations; heuristic disclosure | Check representative herbs/olive oil/processed-meat outputs; avoid clinical validation claims |
| BYOK | Device encryption default; explicit OpenAI/Anthropic/Gemini adapters; optional encrypted cloud vault; no silent fallback | Live Gemini/Claude acceptance deferred; cloud/master-key configuration and production activation separate |
| AI costs | Provider/model/token tracking, photo/search categories, unknown-cost disclosure, bounded request reservations | Validate owner aggregates against controlled provider calls; missing prices must stay unknown |
| Device-local history | Device-only favorites, drafts and keys exist; saved-food defaults now select device-only for users without a saved preference, preserving explicit choices | **Not implemented for the main ledger/profile/progress:** app still uses account database records. Requires a storage abstraction, local migrations, backup/import, and transient AI requests before claiming the agreed local-first architecture |
| Lifetime local functionality | License terms preserve local license after maintenance lapse | Requires the missing usable local ledger/report architecture; entitlement wording alone does not deliver offline functionality |
| Backup/export | Account JSON/CSV and device-food export controls | Full local backup/restore and recovery acceptance once local history exists |
| Account security | Authentication, conditional MFA, owner MFA, RLS/ownership checks and no client service keys | Deployment-specific security review after remaining changes; existing source tests are not a fresh full production audit |
| Release operations | Separate test branch/build, production isolation, full regression suite, 23 deployed public assets verified before this change | Package and verify each new change; final migration/deployment/rollback plan and owner release approval |
| Premium tier | Reserved future concept, no price or checkout | Deferred; no invented price/features |

## Decisions that must not be guessed

1. Subscriber reward points and cents per point.
2. Affiliate payout method, timing/minimum and refund hold/reconciliation policy.
3. BYOK sellout behavior: older hide instruction versus later $295 replacement offer.
4. Whether local-first storage is required before this release. It remains a requirement until explicitly changed; do not call the current cloud ledger compliant.

## Product disclosures

Updated draft Terms to describe the implemented monthly/lifetime/maintenance/referral policies, with activation gates and outstanding local-functionality limitation. Updated privacy facts for the three supported providers and device-key request-time transmission. Standard storefront naming now matches the canonical plan name. Prices were not changed. Draft legal-review status remains.

## Latest verification

Full `npm test` passed after adding owner commission-ledger runtime coverage. It verifies owner/MFA denial, invalid cursor rejection, 100-record pages, next-page cursors, preservation of refund/payout evidence, no-store responses and query failure handling. This is synthetic source execution, not live financial-data inspection or payout execution.

Maintenance safeguard: runtime tests verify no Stripe access before the third anniversary, including leap-day boundaries; renewal is allowed at the exact end of the included period. Existing renewal pricing and no-back-fee behavior remain unchanged.

Isolated deployments: manage-referrals v9 and sandbox-create-license-checkout v9, both with gateway JWT verification. Anonymous commission access returned HTTP 401. No live financial records were read and no payment was created. Expanded deployment verification now covers account/referrals/pricing/maintenance/storage assets and draft Terms/Privacy as well as input flows.
