# Priority 1 customer interface — November 3, 2026

## Status
Implemented in the opt-in recipe/planning beta candidate. Not deployed, not live-provider verified, and not physical-phone verified. The production entry points, active beta deployment, shared customer records, billing, database schema and deployed functions were not changed. Owner tools were not changed. This work does not complete Priority 2/3 account-sync or shopping-inventory work.

## Completed in the candidate
1. Mobile readability: high-contrast Refresh/Edit/Sign out controls, minimum touch sizing, wrapping pending-entry actions, and in-flow notifications that do not cover Retry. Recreate retains the progressive layout with readable fields. Same-page browser Back guards preserve the unfinished planning views; kitchen drafts use existing account-namespaced device draft storage.
2. AI setup: missing connection is caught before AI calls. A direct More → AI Settings action opens the existing beta selector, with Back to my work preserving the current view and draft. No provider is automatically chosen or substituted. Retry uses the existing pending entry ID; duplicate concurrent retries and retry of a completed entry are blocked. Error status/context/code are retained through the safe-message wrapper. Personal BYOK does not fall back to hosted requests.
3. Kitchen photos: separate Take Photo and Choose Photos, up to six retained images (8 MB each, 24 MB total), previews and individual removal. Cancel preserves selections. Interpretation is its own request, not recipe generation. The user can correct names/amounts, exclude foods and add missing items. Uncertain identifications start excluded and quantities can stay unknown. Only the explicitly confirmed included list is sent to planning; original photo guesses are not resent. Changed photos/details require review again while prior edits/exclusions survive. Manual food entry is available.
4. Favorites: all loaded favorites appear initially, and all matching items remain available. Clear resets keyword and Favorites-only filtering without losing selected recipes. Existing tests plus larger all-match fixtures verify there is no one-result cap.

The known wrong-variable cleanup defects in the two legacy temporary-photo handlers are also repaired in the beta artifact. Cleanup failures do not strand those buttons. New pantry cleanup failures retain a retryable path list with a cleanup-only action; this is not a claim of guaranteed deletion during network failure.

## Backend and build boundary
`beta-pantry-review` is a new beta-only endpoint. It checks a real signed-in user through the pinned existing auth adapter, existing MFA/adult/provider membership gates, and exact account-owned pantry photo paths before privileged storage reads. Images are bounded and private. Existing allowance reservation, accounting and processing metrics are reused. The plan uses the confirmed list plus the user's saved requirements; no meal, favorite or shopping entry is written by planning.

The source endpoint refuses non-beta execution. The packaging script creates a beta-prefixed bundle and does not deploy. Do not publish the new frontend alone: publish the matching beta endpoint and reviewed frontend together after the established acceptance checks. No production function or schema replacement is required for this increment.

Build: `npm run build && node scripts/build-recipe-workflow-beta.mjs`.
Package endpoint: `node scripts/package-priority-one-functions.mjs`; output `/tmp/mealdaddy-priority-one-function.json`.

## Verification actually run
- Full `npm test` suite passed locally.
- 52 new deterministic checks: photos, corrections, exclusions, unknown quantities, setup errors, cleanup, request boundaries and all-match Favorites.
- 73 endpoint checks: beta/auth/MFA/adult gates, account-path isolation, read errors, allowance denial, provider failure, accounting and cleanup. The actual endpoint runs in a VM with synthetic adapters; this is not live Supabase/provider verification.
- 40 assembled-beta retry checks: same entry ID, no call without setup, no hosted fallback for missing personal key, duplicate retry protection, preserved HTTP status/context and legacy cleanup repair.
- 49 Chromium checks on actual UI modules/CSS with synthetic data and mocked draft/storage/provider adapters. Includes native `history.back()`, photo appending/cancel/removal, confirmation gating, correction preservation, settings/return flow, failed cleanup recovery, inert model text, and mobile layout widths 320, 360, 390, 768 and 1280 px.
- 36 Favorites Chromium checks: all four initial meals, field searches, hidden checked selection retained, Clear resets all filters, no AI/backend calls while searching, and responsive layout.
- App/client JavaScript syntax, beta packaging and whitespace checks passed. Rendered mobile screenshots inspected. Local builds used the repository's bundled client; fresh pinned dependency installation/full vendor build are separately checked by CI.

Tests: `tests/priority-one-core.mjs`, `tests/priority-one-endpoint.mjs`, `tests/priority-one-retry.mjs`, `tests/priority-one-browser.py`, and `tests/favorite-search-browser.py`.

## Still required before declaring live beta completion
Controlled authenticated live-provider and storage tests; real device draft persistence; actual Android/iPhone camera/gallery/keyboard/Back/print behavior; beta deployment and served-version checks. The browser harness cannot establish those facts. Review revised code and account isolation independently before release.

The new kitchen meal-plan result is plain text. Connecting it to the full saved-recipe/print/shopping pipeline remains Priority 2. Recipe-library/shopping account sync and cross-device links remain Priority 3. No completion is claimed for those items here.
