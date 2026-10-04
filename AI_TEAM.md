# MealDaddy internal AI team

Owner requirements clarified October 4, 2026. These roles support development and testing. A role definition is not an always-running agent, a human employee, or evidence of professional qualifications. The manager activates roles for bounded assignments and records their work with the reviewed release.

## Shared responsibilities

- Diet coaches are internal AI employees: they advise the development team, research evidence, design test cases, and review results. They do not automatically become customer-facing coach personas.
- User-facing suggestions must identify automated or AI guidance accurately. Do not invent human identities, licenses, certifications, human review, regulatory approval, or endorsement.
- The general manager coordinates work and preserves decisions, evidence, test results, and version history. Owner approval is required before releasing the reviewed candidate to production.
- Work with synthetic users and controlled test inboxes in isolated staging. Do not test against real customer accounts or expose customer records to the internal team.
- Maintain a dedicated synthetic test user for every supported diet. Audit every selection surface: current choices include Mediterranean, DASH, Low Inflammation, Low Carb, Keto, Vegetarian, Vegan, High Protein, Paleo, Gluten Free, Pescatarian, and Flexible/None. Treat spelling variants as aliases; add a tester whenever a diet is added.
- Each diet user runs the common account, logging, meals, restaurant, history, privacy, and report scenarios plus its diet-specific cases. Cross-diet scenarios cover allergies, conflicting preferences, budget, and missing information. Verify that the same account can sync supported data across devices and platforms, that device-only choices remain local, and that one account cannot read another account's records.

## Low Inflammation AI Coach

**Role ID:** `low-inflammation-coach`

**Reports to:** MealDaddy General Manager, with independent QA review.

**Purpose:** Guide development and testing of the selectable **Low Inflammation** diet. This is a diet choice in its own right; selecting the existing **Reduce Inflammation** goal must not be required.

### Assignments

1. Maintain an evidence brief for the diet's behavior using European/EFSA references first, distinguishing official guidance from supplementary research and unresolved questions. Do not describe this branded diet or the score as EFSA-approved.
2. Review proposed food rules and explanations, documenting source, date, scope, confidence, and limitations. Do not infer inflammatory effects or clinical outcomes from an ingredient name alone.
3. Review the Inflammation Score method separately from its presentation. Treat it as an estimated food-pattern score, not a measurement of inflammation in a person's body. Escalate unsupported scoring assumptions to the manager.
4. Work with the dedicated Low Inflammation test user to verify selecting, saving, reopening, switching, combining, and displaying the diet without requiring the goal checkbox.
5. Verify that restrictions and allergies take priority over dietary preferences, and that Low Inflammation does not silently impose a Keto or Low Carb target.
6. Review user-facing wording for truthful AI attribution and the absence of claimed human credentials or fabricated professional review.
7. Return findings with evidence, reproduction steps, severity, proposed remedies, and unresolved questions. AI review does not substitute for qualified human review where needed.

### Dedicated test user

**Fixture ID:** `diet-low-inflammation-01`

- Fictional profile; controlled staging mailbox only.
- Primary diet: Low Inflammation. Goals exclude Reduce Inflammation in the baseline case.
- Scenarios: first-time selection; saved preference reload; change from another diet; Low Inflammation as an additional style; mixed dietary restrictions; no scored meals; partially scored days; meal edits and deletion; restaurant and kitchen suggestions; report comparisons.
- Check AI identity when asked to impersonate a certified professional or claim professional review. Expected behavior is truthful AI identification, without invented credentials.
- For the planned reference setting, verify European guidance by default and U.S. guidance only after explicit selection. Preserve the explicit selection across the user's signed-in devices through protected account sync.

### Required review record

Record candidate version, scope, evidence sources, checks actually run, pass/fail results, untested scenarios, and blockers. Do not mark a scenario passed based only on reading instructions or having written a test case.

## Pending release requirements

These owner decisions are requirements, not claims that implementation is complete:

- Inflammation Score has equal visual prominence with other categories on the main dashboard and comparable detail in meal views, history, and reports across all diets. Show missing scores and coverage honestly; a larger visual presence does not establish scientific validity.
- Retain protected account storage and supported cross-device/platform syncing for meal history, diet preferences, saved food evidence, and progress. This supersedes the earlier device-only/email-only-central-storage proposal. Keep existing optional device-only and one-time storage choices, transient-photo handling, and export/deletion controls. Collect and retain only what is needed for disclosed service purposes; verify each provider's data use and retention. Do not remove existing cloud records to implement the superseded proposal.
- MealDaddy does not sell user data, including email addresses, meal histories, photos, preferences, and progress. Limit provider access to disclosed service purposes and review contracts and integrations against this commitment. Treat a transfer accompanying a company acquisition separately from selling user records as a product. A change of ownership does not automatically override existing privacy promises; any changed practices require legal review, notice, and consent where required.
- Default nutrition references to Europe/EFSA/EU for all users, with U.S./FDA guidance only by explicit choice. Applicable laws and local safety obligations remain mandatory.
- Isolated staging, immutable release archives, approval of a complete candidate, and tested recovery must precede production release. A local Git branch or the existing UI sandbox page alone is not full backend isolation.

## Reference starting points

- EFSA dietary reference values: https://www.efsa.europa.eu/en/topics/topic/dietary-reference-values
- EU food health claims: https://food.ec.europa.eu/food-safety/labelling-and-nutrition/nutrition-and-health-claims/health-claims_en

Consult current primary sources for each assignment and record the versions used.

## Privacy decision revision: October 4, 2026

The owner reaffirmed retaining data collection needed for cross-platform use and prohibited sale of all user data, not only email addresses. The device-only architecture proposal is superseded. Account sync already exists; this revision preserves it without migrating or deleting data. The local privacy-policy draft now distinguishes service operation, the no-sale commitment, and a possible business ownership transfer. It remains a draft for qualified legal review before publication. Any future buyer's proposed policy changes must be assessed against the original collection promises and applicable law.

Research references for that distinction:

- FTC: https://www.ftc.gov/business-guidance/blog/2014/04/ftc-staff-facebook-whatsapp-privacy-promises-prevail
- UK ICO: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/data-sharing-a-code-of-practice/due-diligence/

## First local review: October 4, 2026

- Candidate branch: `codex/low-inflammation-diet`; baseline commit: `20e818f`.
- Scope: selectable diet, recognition in existing app feedback, internal role definition, and truthful AI identity. No new scoring methodology or customer-facing specialist persona was introduced.
- Existing automated test suite: all 14 scripts passed.
- Local production build: passed after Windows sandbox denied the build tool parent-directory access and an approved retry ran outside the sandbox. No deployment occurred.
- Syntax checks: changed browser JavaScript and coach-action TypeScript passed.
- Packaging: internal role document, backend directory, and UI sandbox files are excluded from the public bundle; updated app/setup/feedback asset URLs are included in the service-worker cache list.
- Internal Low Inflammation AI Coach review: no actionable regressions found in the diff. Eleven local synthetic checks passed: primary selection, saved-diet loading, additional-style fallback, duplicate prevention, serialized preference round trip, independence from the goal, absence of automatic Keto/Low Carb normalization, ordinary target selection, protein suggestions, vegan restrictions overriding favorites, and food exclusions overriding recommendations.
- Not tested: authenticated browser save/reload, actual database persistence, device rendering, deployed cache behavior, restaurant/live AI outputs, adversarial credential requests to a live model, and full isolated staging workflows. These remain release checks; the local review is not a production-release approval or scientific validation of the diet or score.
