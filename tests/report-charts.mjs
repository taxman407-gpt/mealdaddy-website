import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../app/app.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../app/app.js", import.meta.url), "utf8");

assert.match(html, /id="report-charts"/);
assert.match(html, /id="weight-chart-points"/);
assert.equal((html.match(/class="v1-over-track"/g) || []).length, 8);
assert.match(html, /data-metric="inflammation"/);
assert.match(html, /id="inflammation-total">—<\/span> \/ 10/);
assert.match(script, /summarizeInflammationEntries\(state\.entries\)/);
for (const metric of ["calories", "protein", "carbs", "netCarbs", "fat", "fiber", "water"]) {
  assert.match(script, new RegExp(`key: "${metric}"`));
}
assert.match(script, /renderReportCharts\(dailySeries\)/);

console.log("Report and weight chart checks passed.");
