import assert from "node:assert/strict";
import { metricProgressSegments } from "../app/metric-progress.js";

assert.deepEqual(metricProgressSegments(50, 100), { goalWidth: 50, excessWidth: 0, over: false });
assert.deepEqual(metricProgressSegments(100, 100), { goalWidth: 100, excessWidth: 0, over: false });
assert.deepEqual(metricProgressSegments(110, 100), { goalWidth: 80, excessWidth: 8, over: true });
assert.deepEqual(metricProgressSegments(101, 100), { goalWidth: 80, excessWidth: 4, over: true });
assert.deepEqual(metricProgressSegments(150, 100), { goalWidth: 80, excessWidth: 20, over: true });

console.log("Metric progress over-target checks passed.");
