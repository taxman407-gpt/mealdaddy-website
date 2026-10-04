import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../app/app.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../app/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");

assert.match(html, /data-close-metric-breakdown>← Back to Today</);
assert.match(html, /class="button button-primary metric-breakdown-back"[^>]+data-close-metric-breakdown>Back to Today</);
assert.match(script, /function contributionEvidenceSource\(contribution\)/);
for (const source of ["Nutrition label values", "Estimated from the meal photo", "Your saved favorite values", "Restaurant guidance or published menu data", "Estimated from your logged meal description"]) {
  assert.match(script, new RegExp(source));
}
assert.match(script, /<b>Source:<\/b>/);
assert.match(script, /showAppView\("today", \{ focus: false \}\)/);
assert.match(styles, /\.metric-contribution-source/);
assert.match(styles, /\.metric-breakdown-back/);

console.log("Metric breakdown source and return checks passed.");
