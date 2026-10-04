import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../app/saved-foods.js", import.meta.url), "utf8");

for (const field of ["nickname", "sodium_mg", "added_sugar_g", "saturated_fat_g", "is_pinned"]) {
  assert.match(script, new RegExp(`stagedSavedFoodColumns[\\s\\S]*${field}`));
}
assert.match(script, /async function writeSyncedFood\(payload, editing\)/);
assert.match(script, /while \(true\)[\s\S]*missingSavedFoodColumn[\s\S]*delete compatiblePayload\[missingField\]/);
assert.match(script, /mealdaddy-saved-food-overrides/);
assert.match(script, /state\.fieldOverrides\[data\.id\]/);
assert.match(script, /state\.fieldOverrides\[food\.id\]/);

console.log("Saved-food staged-schema compatibility checks passed.");
