# Meal photos and processing usage — private beta

Implemented on the October feature branch; production frontend and production function names were not deployed.

- First-entry logging accepts up to four photos of one meal. Restaurant results offer an “Add photos / review” handoff before logging. Saved meal edits accept additional photos; attachment-only saves preserve nutrition, while explicit analysis uses all attached views and respects written corrections.
- Photo paths are owner-validated, private uploads are sanitized, drafts retain multiple files, stale edits retain compare-and-swap protection, and deleting a meal removes its attached photos.
- Owner Tools → AI usage & costs provides date-filtered counts, per-meal averages and estimated USD costs. Server-only tracking records every dispatched call before the provider request. Pending/time-out and unpriced requests remain visible rather than becoming zero cost.
- Instrumented beta endpoints: estimate-entry, coach-action, analyze-saved-food, adjust-leftovers. Photo analyses include favorite labels and leftovers. Restaurant search/formatting calls share a reservation ID and count as one research request.
- Standard OpenAI prices were verified on 2026-10-25 for gpt-5.6-luna and gpt-5-mini; input, cached-input, output and web-search charges are included. Other models/providers have unknown prices until a verified rate is added. Rates are stored by version on each call. Hosted, sponsor and personal funding are separated. These are estimates, not invoices; photo cost allocates the entire analysis request.
- A successful provider response counts as processed even if downstream validation rejects its content. Network uncertainty and rejected calls remain separate. No prompts, descriptions, image URLs, credentials or response contents are stored in this telemetry.
- Averages use currently saved meal entries created in the same effective UTC window across the shared account database. Beta and production request rows share this denominator. Deleted meals are excluded. The report states these limitations, and does not reconstruct pre-rollout history.

Validation: complete regression suite; new provider telemetry tests; multi-photo estimator handler tests; all builds; synthetic database assertions (rolled back) for two photos, two calls grouped as one restaurant request, exact cost sum and zero-denominator handling. Authenticated/anonymous table access and report execution privileges were checked and denied. Owner report loaded through the authenticated beta browser. No live AI request was made solely for QA.

Database migration: 20261025010046_ai_processing_metrics.sql, shared-account project egbieqvbwniaxgqjzqkp. Beta function versions deployed: estimate-entry 5, coach-action 5, analyze-saved-food 10, adjust-leftovers 5, owner-conversion-report 4. Security advisor notices for the two server-only tables having no member policies are intentional; existing leaked-password protection warning is unrelated.

Deployed beta asset verification passed for all 23 checked files; browser inspection confirmed owner report access and the first-entry Photo control has the multiple-selection attribute.
