# MealDaddy October 2026 — isolated upgrade test plan

Status: planning only. Production and customer records must not be modified.
Baseline: main commit 364f18d5ac4238d2dae0525c299d0d4297d6f7a4 (2026-10-16).
Branch: feature/october-2026-upgrade.

## Environment gates
- GitHub branch is isolated from main. Do not merge or deploy until owner acceptance.
- Cloudflare: inspect current deployment ID/status and configure a separate nonproduction route/environment. Current wrangler config disables workers.dev and preview URLs; do not reuse production route.
- Supabase: existing project egbieqvbwniaxgqjzqkp is production. Never run tests against its user records. Provision a distinct development database with synthetic data only after cost approval if required. Do not expose production secrets.
- Stripe: use test mode and test webhook signing secrets only; no production payments.
- AI providers: test keys and capped usage only, with deterministic mocks for CI.
- Capture rollback, baseline release hashes, migration plan, and release approvals.

## Priority 0 — existing fixes to verify
1. Editing meal replaces old calculated JSON/components on same ledger row, no duplicate meal, original timestamp preserved.
2. Portion percentage 50% scales calories, protein, total carbohydrate, fiber, net carbs, fats, sodium consistently exactly once; net carbs = adjusted carbs minus adjusted fiber, subject to product-specific definition.
3. Removing dressing or greens never reintroduces them from an old photo or prior AI response.
4. Concurrent edits cannot be overwritten by stale AI estimate.
5. Authenticated owner tests corrected live meals only in owner's browser after explicit approval; do not use real data in development.
6. Mobile metrics alignment, Owner Tools navigation/MFA, and photo failure feedback regression tests.

## Priority 1 — edit UX
- Edit Meal opens with description focus.
- Direct percent-consumed control independent of photo, supporting precise input and clear default.
- Optional leftover photo with or without initial photo; clarify whether it depicts remaining or eaten food.
- Android hardware/software Back navigates logically and autosaves drafts; periodic autosave, crash restore, no duplicate submissions or daily-total changes until finalization.

## Priority 1 — photo reconciliation
- Evaluate photo sharpness, light, obstruction and suitability.
- Explicit user text is authoritative: cauliflower crust stays cauliflower crust.
- Potential new item absent from text (olives, drinks, dressings) must be named as uncertain and confirmed: Add / Exclude / Correct.
- Correct opens editable identification and amount, action exactly 'Add Corrected Entry'; replace mistaken item, recalculate, no duplicates.
- Do not silently add suspected sweet tea from Diet Dr Pepper; retain user exclusions per meal.
- Ask on material clear contradictions, but not on visual inability to verify a stated attribute.

## Priority 1 — inflammation
- Ingredient-aware scoring for herbs/spices, olive oil, garlic, vegetables, processed meats; weight by amount.
- Explain contributors; separate composition score from portion-related exposure.
- Scores are heuristic, not a clinical biomarker; avoid unsupported precision and simplistic doubling.

## Priority 2 — billing and business model
- Standard $9.99/month, BYOK $6.99/month; future Premium unpriced.
- Founding lifetime Standard $350, BYOK $250, three years maintenance included; initial Year 4 maintenance $60/$36 with 60-day advance notice of reasonable changes, lapse/reactivation without back fees.
- BYOK provider selection and key privacy; never expose keys in logs/client bundles beyond explicit user-managed device storage; no silent provider switching.
- Approved affiliates: 15% eligible net subscription receipts for first 12 months; lifetime 15% of 50% eligible proceeds once.
- Subscriber referrals: one reward only after first qualifying collected payment, up to $5/month discount redemption; conversion/award values still TBD.
- Refunds, idempotent Stripe webhooks, cancellation, entitlement transitions, trials and account isolation.

## Security and acceptance gates
- Synthetic account A cannot access account B's meals, keys, subscriptions or referrals.
- Owner-only routes protected by immutable server authorization and MFA.
- No service role keys, Stripe secrets, or provider secrets in public assets.
- Automated CI: unit, integration, DB migration, RLS, UI browser mobile widths, Android Back, photo fixtures, billing webhook replay.
- Human acceptance: actual Android Back and browser edit flow, sample 50% pizza, herbs/bacon score explanation, uncertain beverage correction, leftover photo with no initial photo.
- Record pass/fail evidence and deployment IDs; owner approval before any production changes.
