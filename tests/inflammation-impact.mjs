import assert from "node:assert/strict";
import {
  estimateInflammationScore,
  inflammationBand,
  summarizeInflammationEntries,
  summarizeInflammationReport,
  weightedInflammationScore
} from "../app/inflammation-impact.js";

const components = [
  { name: "Salmon", calories: 240, inflammation_score: 2 },
  { name: "Leafy greens", calories: 40, inflammation_score: 1 },
  { name: "Cream sauce", calories: 120, inflammation_score: 7 }
];

assert.equal(weightedInflammationScore(components), 3.4);
assert.equal(estimateInflammationScore({ inflammation_score: 4.4, components }), 4.4);
assert.equal(inflammationBand(2).tone, "lower");
assert.equal(inflammationBand(5).tone, "moderate");
assert.equal(inflammationBand(8).tone, "higher");

const entries = [
  { kind: "meal", status: "estimated", occurred_at: "2026-08-01T12:00:00Z", nutrition_estimate: { calories: 500, inflammation_score: 3 } },
  { kind: "meal", status: "estimated", occurred_at: "2026-08-01T18:00:00Z", nutrition_estimate: { calories: 250, inflammation_score: 6 } },
  { kind: "meal", status: "estimated", occurred_at: "2026-08-02T12:00:00Z", nutrition_estimate: { calories: 400, inflammation_score: 8 } },
  { kind: "meal", status: "estimated", occurred_at: "2026-08-02T18:00:00Z", nutrition_estimate: { calories: 100 } },
  { kind: "hydration", status: "estimated", occurred_at: "2026-08-02T09:00:00Z", nutrition_estimate: { inflammation_score: 1 } }
];

const today = summarizeInflammationEntries(entries.slice(0, 2));
assert.equal(today.score, 4);
assert.equal(today.scoredMeals, 2);

const report = summarizeInflammationReport(entries, (value) => value.slice(0, 10));
assert.equal(report.score, 6);
assert.equal(report.scoredDays, 2);
assert.equal(report.scoredMeals, 3);
assert.equal(report.unscoredMeals, 1);

console.log("Inflammation-impact checks passed.");
