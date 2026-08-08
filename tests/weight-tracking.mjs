import assert from "node:assert/strict";
import { shouldEnableWeightTracking } from "../app/health-metrics.js";

assert.equal(shouldEnableWeightTracking({ goals: ["Lose Weight"] }), true);
assert.equal(shouldEnableWeightTracking({ goals: ["Maintain Weight"] }), true);
assert.equal(shouldEnableWeightTracking({ goals: ["Gain Muscle"] }), true);
assert.equal(shouldEnableWeightTracking({ uses: ["Weight tracking"] }), true);
assert.equal(shouldEnableWeightTracking({ goals: ["Eat Healthier"], uses: ["Log meals"] }), false);
assert.equal(shouldEnableWeightTracking({ goals: [" lose weight "] }), true);

console.log("Weight-tracking preference checks passed.");
