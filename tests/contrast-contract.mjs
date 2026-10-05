import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");
const instructions = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");

assert.match(instructions, /Visual contrast is a release requirement/);
assert.match(instructions, /Never use black, `--ink`, `--forest`, or the light-theme `--muted` token directly on dark green/);

for (const token of ["--v1-text: #fff", "--v1-muted: #bed0c8", "--v1-accent: #f58e63", "--v1-control-border: #568877", "--v1-focus: #258cff"]) {
  assert.ok(styles.includes(token), `Missing dark-surface token ${token}.`);
}

assert.match(styles, /\.v1-live \.coach-launcher \.coach-action-form > label > strong,[\s\S]*\.v1-live \.feedback-comment \{ color: var\(--v1-text\); \}/);
assert.match(styles, /\.v1-live \.coach-launcher \.recipe-options label small,[\s\S]*color: var\(--v1-muted\);/);
assert.match(styles, /\.v1-live #account-email \{ color: var\(--v1-muted\); \}/);
assert.match(styles, /\.v1-live \.app-header \.text-button \{ color: var\(--v1-lime\); \}/);
assert.match(styles, /\.v1-live \.ledger-icon \{ color: #071711; background: var\(--v1-lime\); \}/);
assert.match(styles, /\.v1-live \.ledger-item small,[\s\S]*color: var\(--v1-muted\);/);
assert.match(styles, /\.v1-live \.reports-heading > div > p:last-child,[\s\S]*\.v1-live \.report-completeness,[\s\S]*color: var\(--v1-muted\);/);
assert.match(styles, /\.v1-live \.v1-plan-choices > #plan-dinner \{ color: var\(--v1-text\); background: var\(--v1-panel\); \}/);
assert.match(styles, /\.v1-live \.metric-breakdown-panel,[\s\S]*\.v1-live \.saved-food-item \{ color: var\(--ink\); \}/);
for (const lightSurface of ["onboarding-panel", "settings-preview", "pricing-card", "ledger-edit-form", "meal-impact-details", "saved-food-item"]) {
  assert.match(styles, new RegExp(`\\.v1-live \\.${lightSurface}(?:,| \\{ color: var\\(--ink\\);)`), `Missing light-surface reset for ${lightSurface}.`);
}
assert.match(styles, /\.v1-live \.onboarding-panel \.eyebrow,[\s\S]*\.v1-live \.pricing-card \.eyebrow \{ color: #a44322; \}/);
assert.match(styles, /\.v1-live \.subscription-section \.pricing-heading > p:last-child,[\s\S]*\.v1-live \.subscription-section \.pricing-note \{ color: var\(--v1-muted\); \}/);
assert.match(styles, /\.v1-live \.subscription-section \.billing-status \{ color: var\(--v1-lime\); \}/);
assert.match(styles, /\.v1-live \.today-heading \.eyebrow,[\s\S]*color: var\(--v1-accent\);/);
assert.match(styles, /\.v1-live :where\(button, a\[href\], summary, input, select, textarea\):focus-visible/);

console.log("Dark-green contrast contract checks passed.");
