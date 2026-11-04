# Recipe recreation and traceable shopping lists — development draft

Status: implemented as an opt-in frontend draft, not deployed. Related to issue #7.
Base reviewed: `feature/october-2026-upgrade` at `bf72c1e26d9cfafcbc3609b9c9c478294109d221`.

## Owner requirements included

- Recreate a Favorite Meal starts with a visible choice: saved favorite, restaurant menu match, or description. Stages are displayed progressively rather than a long, crowded form.
- The existing Restaurant Mode `coach-action` request path supplies menu choices; suggested substitutions are reviewed and explicitly confirmed before a `recipe-recreation` request. The adapters retain the app's existing membership/provider routing.
- Recipe output has full ingredients/instructions, Save Recipe, Save as Favorite, editable text export, and Print / Save PDF. A separate prompt offers Save & Add to Shopping List, Save to consider later, or Not now. None of these actions logs a meal as eaten.
- More gains Shopping List. Saved recipes are explicitly selected, servings adjusted, exact matching ingredients/units combined, and confirmed stock deducted. Unknown quantities are flagged; unsupported conversions are not invented.
- Every generated shopping item retains links to the source recipe/meal. A source link opens an editable general description and ingredient snapshot for that list. Original favorites are not silently overwritten.
- Editing a source marks quantities stale. Refreshing retains manual purchase quantities, checkmarks, exclusions and manually added items, and flags affected overrides for review. Removed requirements with manual edits are retained and marked for review rather than silently discarded.
- Text and PDF exports include source titles, descriptions and backlink URLs. Text is editable. PDF is a print-ready copy, editable/annotatable only with the user's PDF software. Exported-file edits do not import or sync automatically.

## Deliberate limitations / release blockers

This is NOT completion of issue #7. The new recipe library/favorite flags and shopping list are device-local and account-keyed; they are not cloud-synced. This must be reconciled with the final existing recipe-storage/favorite architecture before release. The existing backend may privately cache generated recipes under its current behavior; this draft makes no new backend/schema changes. Device storage is not encryption, and shared-device use is discouraged.

Export backlinks work only with the same signed-in account and a retained source on that device. Cross-device/permanent account URLs require the future shared persistence integration. The exported source description remains useful if the link cannot resolve.

The current recipe endpoint caps source descriptions at 500 characters. This draft rejects longer combined descriptions/substitutions visibly instead of letting the server truncate them. A coordinated backend limit/validation change is still desirable.

Pantry-photo review/multiple-photo ingestion, richer pantry reconciliation, department grouping, account-synced saved recipes/lists, text reimport and direct editable-PDF creation are not implemented here. The phone's native print/PDF dialog, real provider requests, real menu accuracy, app-wide CSS regressions, persistent browser storage and cross-account server authorization still need isolated integration/device tests. No real user accounts, live AI requests, database writes or production resources were used for validation.

## Build and review

From a full checkout with its normal dependencies:

```sh
npm run build
node scripts/build-recipe-workflow-beta.mjs
node tests/recipe-workflow.mjs
python tests/inline-browser-check.py
```

The wrapper calls the existing private-beta builder then installs this draft into `dist-beta` only. The existing deployment command is intentionally unchanged; nothing becomes live merely by creating this branch. The integration helper requires an exact unique application anchor and fails closed when it changes. No production build, backend, auth, billing or customer records are modified.

The Python test needs Playwright and a Chromium browser. Set `CHROMIUM_EXECUTABLE` if needed; `MEALDADDY_TEST_OUTPUT` controls output location. It renders an inline synthetic fixture because this environment blocks browser navigation. Network APIs, localStorage and history are mocked. These tests do not establish deployed integration or actual storage persistence.

## Evidence actually obtained

- 27 deterministic Node assertions passed: fraction parsing, unknown quantities, compatible-unit consolidation, serving scaling, stock subtraction, no unsafe unit merge, source links, escaping and preservation of manual edits.
- 30 inline Chromium assertions passed: favorites, confirmation gating, mocked endpoint routing, accepted substitutions, source editing/backlinks, stale warnings, editable export content, account-key scoping with mock storage, signout display cleanup and no runtime errors.
- Synthetic recipe and shopping layouts checked at widths 360, 390, 768 and 1280 px without horizontal overflow. Mobile renders inspected.
- Browser-generated shopping PDF inspected through PDF text/link extraction and page rendering: source description and manual quantities retained, clickable source links present, account ID and navigation omitted.
- This is local implementer testing, not independent verification or release approval. Full build/regression tests and deployed/physical-device testing remain pending.
