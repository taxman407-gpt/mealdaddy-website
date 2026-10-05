import assert from "node:assert/strict";
import { adaptiveHydrationGuidance } from "../app/adaptive-hydration.js";

const clinician = adaptiveHydrationGuidance({ hydrationOunces: 54, hydrationGoalOunces: 64, sodiumMg: 2600, sodiumGoalMg: 2000, targetSource: "Clinician recommended", hour: 18 });
assert.equal(clinician.remaining, 10);
assert.equal(clinician.clinicianSet, true);
assert.equal(clinician.sodiumHigh, true);
assert.match(clinician.message, /10 oz remaining/);
assert.match(clinician.message, /will not raise your fluid target automatically/);

const over = adaptiveHydrationGuidance({ hydrationOunces: 72, hydrationGoalOunces: 64, sodiumMg: 2800, sodiumGoalMg: 2000, targetSource: "Clinician recommended", hour: 18 });
assert.equal(over.over, 8);
assert.match(over.message, /Do not add extra fluid just because sodium is elevated/);

const paced = adaptiveHydrationGuidance({ hydrationOunces: 10, hydrationGoalOunces: 90, sodiumMg: 800, sodiumGoalMg: 2300, targetSource: "My own target", hour: 14 });
assert.match(paced.message, /pace up to 12 oz/);
assert.doesNotMatch(paced.message, /raise/);

console.log("Adaptive Hydration guardrail checks passed.");
