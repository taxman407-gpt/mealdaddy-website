import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../app/app.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../app/app.js", import.meta.url), "utf8");

assert.match(html, /id="report-charts"/);
assert.match(html, /id="weight-chart-points"/);
assert.match(html, /id="weight-goal-line"/);
for (const period of ["week", "month", "year"]) assert.match(html, new RegExp(`data-weight-period="${period}"`));
assert.match(html, /data-weight-period="year" aria-pressed="true"/);
assert.match(html, /id="weight-chart-area"/);
assert.doesNotMatch(html, /id="weight-bmi-line"/);
assert.equal((html.match(/class="v1-over-track"/g) || []).length, 11);
assert.match(html, /data-metric="inflammation"/);
assert.match(html, /id="inflammation-total">—<\/span> \/ 10/);
assert.match(script, /summarizeInflammationEntries\(state\.entries\)/);
for (const optionalMetric of ["sodium", "addedSugar", "saturatedFat"]) {
  assert.match(html, new RegExp(`data-metric="${optionalMetric}"`));
}
for (const metric of ["calories", "protein", "carbs", "netCarbs", "fat", "fiber", "water"]) {
  assert.match(script, new RegExp(`key: "${metric}"`));
}
assert.match(script, /key: "carbs", orderKey: "totalCarbs"/);
assert.match(script, /function orderReportMetrics\(items\)/);
assert.match(script, /orderReportMetrics\(definitions\)[\s\S]*reportLineChart/);
assert.match(script, /const nutritionMetrics = orderReportMetrics\(\[/);
assert.doesNotMatch(script, /Total\/net carbs/);
for (const optionalField of ["sodium_mg", "added_sugar_g", "saturated_fat_g"]) {
  assert.ok((script.match(new RegExp(`typeof nutrition\\.${optionalField} === "number"`, "g")) || []).length >= 2, `${optionalField} must be accumulated for daily charts and summary averages.`);
}
assert.match(script, /renderReportCharts\(dailySeries\)/);
assert.match(script, /state\.goalWeightKg[\s\S]*?goalLine\.setAttribute\("y1"/);
assert.match(script, /let weightChartPeriod = "year"/);
assert.match(script, /period === "year"[\s\S]*?setFullYear\(cutoff\.getFullYear\(\) - 1\)[\s\S]*?cutoff\.setDate\(1\)/);
assert.match(script, /period === "week" \? 7 : 30/);
assert.match(script, /entryTimes\[index\] - firstTime\) \/ timeSpan/);
assert.doesNotMatch(script, /hasBmiTrend|weight-bmi-line/);
assert.match(script, /report-average-track/);

console.log("Report and weight chart checks passed.");
