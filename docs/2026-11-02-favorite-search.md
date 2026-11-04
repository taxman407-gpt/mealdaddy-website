# Favorites mood search — November 2, 2026

## Status
Implemented and locally validated in the opt-in recipe/shopping beta candidate. Not deployed. This addition does not close issue #7 or the outstanding account-sync, cross-device-link, pantry-photo, live-provider, or physical-phone requirements.

## Behavior
- Adds “What are you in the mood for?” to My Foods / Saved Favorites, the Recreate a Favorite Meal picker, and Shopping List's saved-recipe picker.
- Searches the saved name/nickname, description, ingredient/component names, restaurant, cuisine, flavor/tags and notes when those fields exist. Case and accents are ignored; partial words work. Multiple words must all match. This is literal saved-text matching, not an inferred dietary or allergy classification.
- Quick searches: Chicken, Soup, Spicy, Pasta. Clear restores the full collection. Counts and an accessible no-match message explain the result.
- Shopping recipe selection additionally offers Favorites only. Filtering never unchecks recipes, overwrites a description, changes pinned order, logs a meal, changes storage policy, or sends an AI request.
- Existing saved-food loading supplies both account-synced records and this device's records. Filtering uses whichever records were actually loaded; it does not manufacture or implement synchronization for the draft recipe library.

## Implementation boundary
`app/favorite-search.mjs` and its scoped stylesheet are shared by the three filters. `scripts/favorite-search-beta.mjs` installs explicitly checked integration changes in the beta artifact. Existing production/deployment commands are unchanged. The build fails rather than guessing if an integration anchor moves or the patch is installed twice.

Build with `npm run build && node scripts/build-recipe-workflow-beta.mjs`.

## Verification performed
- `node tests/favorite-search.mjs`: 32 assertions passed, covering field search, multi-word matching, accent/case normalization, nonmutation, safe scope, favorite-only filtering, checked integration anchors and JavaScript syntax.
- `npm test`: full existing Node regression suite passed with the new test included. Local artifact creation used the repository's existing bundled vendor client; a fresh dependency/vendor build is left to CI.
- `python tests/favorite-search-browser.py`: 34 Chromium checks passed using the actual beta UI modules and original app layout with synthetic records and explicitly mocked account/device storage and network. No live account, backend, menu or AI requests were used.
- 320, 360, 390, 768 and 1280 pixel layout widths passed without horizontal overflow. Main Favorites and Recreate screenshots were visually inspected.
- Enter in either search field does not submit recipe generation. Filtered-out shopping checkboxes remain selected and are included when Apply is chosen. Filtering does not trigger extra backend reads.

The browser fixture runs inline because this environment blocks browser URL navigation. It does not establish real IndexedDB persistence, account synchronization, physical Android keyboard/camera behavior, or live-beta deployment. Physical-phone access through the Browser connector failed because the originating browser context is unavailable in this session.

## Outstanding work from the preceding request
Account-synced recipe/library persistence, cross-device source links, pantry-photo interpretation/review integration and live beta/phone verification remain open. No database/schema, deployed Edge Function, live Worker, account preference, customer record or production website was changed for this search addition.
