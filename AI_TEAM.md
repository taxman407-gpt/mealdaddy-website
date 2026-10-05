# MealDaddy internal AI team

Owner requirements clarified October 4, 2026. These roles support development and testing. A role definition is not an always-running agent, a human employee, or evidence of professional qualifications. The manager activates roles for bounded assignments and records their work with the reviewed release.

## Shared responsibilities

- Diet coaches are internal AI employees: they advise the development team, research evidence, design test cases, and review results. They do not automatically become customer-facing coach personas.
- User-facing suggestions must identify automated or AI guidance accurately. Do not invent human identities, licenses, certifications, human review, regulatory approval, or endorsement.
- The general manager coordinates work and preserves decisions, evidence, test results, and version history. Owner approval is required before releasing the reviewed candidate to production.
- Security issues take priority over feature development, cosmetic changes, growth work, and cost optimization. Correct them promptly; immediately notify the owner with an action plan when the team cannot safely complete or verify a correction.
- Work with synthetic users and controlled test inboxes in isolated staging. Do not test against real customer accounts or expose customer records to the internal team.
- Maintain a dedicated synthetic test user for every supported diet. Audit every selection surface: current choices include Mediterranean, DASH, Low Inflammation, Low Carb, Keto, Vegetarian, Vegan, High Protein, Paleo, Gluten Free, Pescatarian, and Flexible/None. Treat spelling variants as aliases; add a tester whenever a diet is added.
- Each diet user runs the common account, logging, meals, restaurant, history, privacy, and report scenarios plus its diet-specific cases. Cross-diet scenarios cover allergies, conflicting preferences, budget, and missing information. Verify that the same account can sync supported data across devices and platforms, that device-only choices remain local, and that one account cannot read another account's records.

## Expertise and resource selection

Owner direction added October 4, 2026: expertise is the first priority for every AI employee; cost is secondary. The manager should seek the expertise needed for MealDaddy's expansion and growth, recommend outside resources where useful, and bring material expertise/cost tradeoffs to the owner.

### Qualification of a role

- A specialist title, an instruction to act as an expert, or a premium model does not demonstrate expertise. Qualify each role for its actual assignments using relevant evidence, representative cases, domain-specific evaluations, and review of its outputs. Record limitations and work the role is not qualified to approve.
- Define each role's required knowledge, authoritative references, tools, test cases, acceptance criteria, reviewer, and escalation conditions before treating its work as an expert recommendation. Distinguish a configured role from one that has passed its qualification checks.
- Use current primary sources and appropriately licensed data. Keep source provenance, dates, jurisdiction, and uncertainty visible. For nutrition, follow the owner's European-reference default while distinguishing scientific references from applicable local law.
- Use separate verification for consequential work. Multiple AI opinions may share the same errors; agreement alone is insufficient evidence. Seek suitably qualified human review when the assignment requires professional accountability, credentials, independent assurance, or expertise the AI team cannot demonstrate.

### Model assignment and cost

- Choose the most capable suitable available model and tools for complex, uncertain, or consequential assignments. Evaluate suitability for the specific field and task rather than assuming one model is best at everything.
- Consider lower-cost models only after they meet the same task-specific quality requirements. They may handle bounded supporting work such as formatting, classification, or routine extraction after validation, with accountable specialist review where needed. Do not silently lower the required standard to save money.
- Keep strategic architecture, security decisions, nutrition evidence interpretation, legal analysis, and expansion strategy with appropriately qualified leads and reviewers. An inexpensive assistant may prepare inputs without acquiring the lead's approval authority.
- At assignment time, verify actual model availability, capabilities, usage limits, and costs. Record the model/version, task, qualification evidence, reason for selection, reviewer, and applicable resource limit. Use real usage data when available; label estimates and unknown costs honestly.
- Escalate failed evaluations, conflicting evidence, unfamiliar jurisdictions, and tasks outside a role's competence to a stronger suitable model or outside specialist. If the needed capability is unavailable, report the gap rather than presenting weaker work as equivalent.
- When additional expertise appears to offer little benefit relative to its cost, present the owner with the concrete options, expected quality difference, cost basis, risks, and the manager's recommendation. Bundle these decisions at meaningful milestones where possible, except urgent security escalations, which must be raised immediately. Routine assignments within the agreed scope and resources do not require repeated owner approval.
- Expertise-first is not unlimited spending authority. Bring new paid services, external engagements, or increases beyond agreed resource limits to the owner with a concrete proposal; continue independent work that remains within scope.

### Outside expertise and sources

The manager is responsible for recommending outside help proactively when it improves quality or closes a demonstrated gap. Relevant categories include registered dietitians and nutrition researchers, independent security assessors, counsel qualified in each target jurisdiction, privacy specialists, accountants and international tax advisers, accessibility/native-mobile specialists, licensed food-data providers, and market/localization specialists.

Each recommendation should state the problem to solve, qualifications or source quality required, proposed deliverable, evidence supporting the choice, alternatives, estimated cost, data/access needs, and how the team will assess the result. Verify credentials, licensing terms, conflicts of interest, and suitability before relying on the work. Recommendations do not authorize contacting or hiring anyone, sharing user data, purchasing data, or making public claims of certification.

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

## Security team

Owner requirement added October 4, 2026: security review and appropriate testing cover both the MealDaddy website and application, including future Apple and Android releases. The following are internal AI assignments activated by the general manager, not claims of a staffed monitoring service, professional certification, or completed penetration testing.

### Roles and accountability

| Role ID | Responsibility |
| --- | --- |
| `security-lead` | Maintain the threat model, test scope, risk register, evidence requirements, and security recommendation for each release. Prioritize corrections with the general manager; immediately escalate issues the team cannot safely correct or verify to the owner with an action plan, without waiting for a release review. |
| `web-api-security` | Review the public website, browser app, authentication, sessions, server endpoints, uploads, input/output handling, and payment integrations. |
| `cloud-data-security` | Review database and storage access, account isolation, cross-platform sync, secrets, deployment permissions, provider configuration, backups, and recovery. Work with privacy/legal reviewers on actual data flows and the no-sale commitment. |
| `mobile-security` | Test installed PWA behavior now and native iOS/Android storage, permissions, links, network handling, signing, and updates when those builds exist. Browser tests do not establish native-app coverage. |
| `ai-security` | Test hostile instructions in meals, photos, food sources, and model responses; unauthorized data disclosure or actions; unsafe output handling; and AI resource/cost abuse. Coordinate nutrition-safety cases with diet coaches. |
| `security-verification` | Reproduce findings and retest fixes separately from their implementation; record negative tests and coverage gaps. A second AI reviewer is not an independent external audit. |
| `security-operations` | Prepare alert handling, vulnerability triage, access reviews, credential rotation, incident response, and restore exercises. Record which controls are actually enabled and who responds. |

The manager assigns bounded work with named deliverables and records results. The implementer must not be the sole verifier of a security fix. Security specialists can block a release recommendation when required evidence is missing; creating more roles does not expand access, spending, or testing authorization.

### Security priority and immediate escalation

Owner direction added October 4, 2026: security issues have top priority and must be corrected. If the team cannot correct an issue, the owner must be informed immediately with a plan of action.

- Assign a responsible specialist and verifier as soon as a finding is identified. Order security work by impact, exposure, and urgency; do not defer an issue merely to preserve a feature deadline or save model costs. Distinguish a suspected issue from a verified vulnerability while investigating promptly.
- Notify the owner immediately upon recognizing that the team cannot safely implement or verify a correction, at any severity. Triggers include missing access, unavailable expertise, a provider dependency, failed fix verification, or an unresolved spending/approval requirement. Do not wait for repeated failed attempts, the weekly report, or the next milestone.
- Suspected active exploitation, exposed secrets, or exposure of customer data also require immediate owner notification even when the team believes it can fix the issue. State what is known and unknown; do not claim a breach without evidence or include customer records, credentials, or unnecessary exploit details in the alert.
- The initial alert must include a preliminary correction plan: affected service/version and possible impact; the blocker and attempted work; containment completed or recommended; the proposed correction and responsible person/role; any outside specialist, vendor help, access, funding, or approval needed; verification and recovery steps; and an estimated timeline or explicit uncertainty plus the next update point. Send the alert promptly and refine the plan as evidence develops rather than waiting for a complete investigation.
- Continue authorized, safe containment and remediation work while escalating. Pause work or releases that would worsen the exposure. Prepare production changes for the existing owner release-approval process; this rule does not silently authorize destructive actions, third-party contact, new spending, or deployment.
- Track every issue through correction and retesting. Containment is not a completed fix; a local patch is not a production correction. Record the affected environments, verified fix versions, deployment status, remaining exposure, and separate verification evidence before closing the issue. Any lower-severity deferral remains visible with a responsible owner and correction date; inability to correct it still triggers immediate escalation.
- Deliver escalations to the owner in the active chat when discovered during work. This policy does not establish unattended detection or an external notification service; those require explicitly configured monitoring and delivery.

### Testing scope and environments

- Start with local review and local automated checks. Before active integration/security testing, verify an isolated staging frontend, backend, storage, credentials, test email delivery, and Stripe test mode. A preview URL attached to production services is not isolated staging.
- Use anonymous access, two unrelated synthetic member accounts, and a separate least-privilege test administrator. Reuse the diet-specific fixtures for normal workflows and adversarial cases. Never use owner/customer accounts or copy real customer data into test fixtures, AI prompts, logs, or reports.
- For each active test assignment, record owned targets, allowed methods, request/cost limits, test accounts, cleanup, and stop conditions. Exclude third-party infrastructure unless its authorization and applicable provider rules permit the test. Stop if real data, unexpected external targets, or service degradation appear.
- Routine source review and controlled staging checks belong to development. Production checks are limited to explicitly scoped, non-disruptive checks; load, destructive, denial-of-service, and social-engineering tests need separate authorization and an appropriate environment. This document does not authorize a production attack campaign.

### Required coverage

| Area | Evidence required before the applicable release |
| --- | --- |
| Accounts and sessions | Signup, verification, recovery, logout, expired/revoked sessions, redirects, administrator boundaries, and throttling behave correctly through real requests. |
| Account and data isolation | Account A cannot list, read, change, export, or delete account B's meals, photos, recipes, preferences, billing state, or feedback through UI, direct API, database policies, storage paths, or signed links. Anonymous access is also checked. |
| Browser and API inputs | Injection and stored script handling, request forgery where applicable, unsafe redirects or server-side URL fetching, photo type/size enforcement, CSV exports, and error disclosure are tested at the server boundary as well as the UI. |
| Privacy and sync | Authorized sync works across devices; logout/shared-device and offline caches do not expose the previous account; export/deletion and photo retention follow the documented policy; logs, analytics, SDKs, and provider access match disclosed purposes and the no-sale commitment. |
| Billing and abuse | Stripe test-mode signatures, forged/duplicate/reordered callbacks, entitlement changes, retry/concurrency behavior, AI quotas, and request/cost limits resist bypass. |
| AI features | Untrusted content cannot override access controls, expose another account or secrets, trigger unauthorized actions, or inject executable output. Refusals alone do not replace server-side authorization. Diet-specific safety tests remain a separate requirement. |
| Delivery and infrastructure | Secret/dependency scans, least privilege, HTTPS/security headers, private-file exclusions, staging isolation, artifact identity, and environment configuration are verified. Application rollback and database compatibility are checked together. |
| Mobile and recovery | Test actual release platforms and signed native builds when applicable, including secure local storage, permissions, deep links, WebViews, and session handling. Restore a synthetic backup and exercise incident containment/recovery in isolation. |

Use [OWASP ASVS](https://owasp.org/projects/asvs) for application verification requirements (starting baseline: 5.0.0), [WSTG](https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/) for web test procedures, [MASVS/MASTG](https://mas.owasp.org/) for mobile requirements and tests, and the [OWASP Gen AI security risks](https://genai.owasp.org/llm-top-10/) for AI-specific scenarios. Pin the actual editions and requirement/test identifiers in each assessment; document applicability and gaps. Referencing these resources is not OWASP certification or a claim that every control has passed.

### Release evidence and ongoing work

- Each finding records severity, affected version/environment, redacted reproduction steps, impact, responsible role, remedy, and independent retest status. Preserve reports with the release history; keep exploit details and sensitive evidence out of public assets.
- Each release record identifies the source commit, artifact digest, database migrations, configuration, model/prompt/source versions where relevant, exact tests executed, results, limitations, and recovery procedure. Changes after testing invalidate affected evidence and require retesting; promote the approved artifact with recorded environment differences.
- Required security checks must pass. Unresolved critical/high findings, account-isolation failures, authentication bypasses, exposed secrets, or unverified staging isolation block release. Document lower-severity residual risks with an owner and correction date, and immediately escalate any issue the team cannot correct as required above. The security lead's recommendation and the owner's final release approval are distinct.
- Propose scoped external human penetration testing before broad promotion/native-store launch and after major authentication, payment, or data-access changes. The manager prepares the scope and cost for owner approval; AI review does not substitute for that engagement.
- Proposed cadence: relevant regression checks on each change; full applicable staging coverage before release; dependency/advisory triage weekly; access reviews monthly; incident/restore exercises quarterly and after relevant infrastructure changes. This is an operating plan, not an installed schedule or a claim of continuous monitoring.

### Initial local evidence: October 4, 2026

The current checkout already contains security-hardening work. During addition of this team plan, `tests/security-hardening.mjs`, `tests/backend-security.mjs`, and `tests/database-security-hardening.mjs` all passed locally. These three scripts check source/configuration/migration text; they do not execute deployed authentication, database policies, payment callbacks, cross-account requests, or adversarial AI interactions. This record is not candidate release approval. No production probes, migrations, deployments, or external security engagements were performed for this plan update.

## Pending release requirements

These owner decisions are requirements, not claims that implementation is complete:

- Inflammation Score has equal visual prominence with other categories on the main dashboard and comparable detail in meal views, history, and reports across all diets. Show missing scores and coverage honestly; a larger visual presence does not establish scientific validity.
- Retain protected account storage and supported cross-device/platform syncing for meal history, diet preferences, saved food evidence, and progress. This supersedes the earlier device-only/email-only-central-storage proposal. Keep existing optional device-only and one-time storage choices, transient-photo handling, and export/deletion controls. Collect and retain only what is needed for disclosed service purposes; verify each provider's data use and retention. Do not remove existing cloud records to implement the superseded proposal.
- MealDaddy does not sell user data, including email addresses, meal histories, photos, preferences, and progress. Limit provider access to disclosed service purposes and review contracts and integrations against this commitment. Treat a transfer accompanying a company acquisition separately from selling user records as a product. A change of ownership does not automatically override existing privacy promises; any changed practices require legal review, notice, and consent where required.
- Default nutrition references to Europe/EFSA/EU for all users, with U.S./FDA guidance only by explicit choice. Applicable laws and local safety obligations remain mandatory.
- Isolated staging, immutable release archives, approval of a complete candidate, and tested recovery must precede production release. A local Git branch or the existing UI sandbox page alone is not full backend isolation.
- The security team must provide the applicable release evidence and clear blocking findings before the general manager recommends publication. AI-generated test plans and source-only checks do not count as completed end-to-end security testing.

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
