import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyComponentTotals } from "../supabase/functions/_shared/nutrition-reconciliation.mjs";

const edge = readFileSync(new URL("../supabase/functions/estimate-entry/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../app/app.js", import.meta.url), "utf8");

assert.match(edge, /entry_description/);
assert.match(edge, /photo_description/);
assert.match(edge, /description_reconciliation_note/);
assert.match(edge, /not a second meal and not automatically an additional component/);
assert.match(edge, /Never count a pictured item once from the image and again from the typed clarification/);
assert.match(edge, /applyComponentTotals/);
// Initial photo analysis can describe the image, but an edited description and
// explicit consumed percentage must remain authoritative and survive retries.
assert.match(edge, /editedText && entry.nutrition_estimate\?\.analyze_photos !== true \? \[\] : retainedPhotoPaths/);
assert.match(edge, /const finalDescription = photoPath && generatedDescription && !portion\.explicit && !hasUserDescription/);
assert.match(edge, /description: finalDescription/);
assert.match(edge, /entryDescription: finalDescription/);
assert.match(edge, /unchangedEntryUpdate\(admin, user\.id, entry/);
assert.match(edge, /needsPhotoDescription/);
assert.match(app, /estimateData\?\.entryDescription/);
assert.match(app, /entry\.description\.trim\(\)\.toLowerCase\(\) === "meal photo"/);
assert.match(app, /descriptionReconciliationNote/);

const clarifiedPhotoEstimate = applyComponentTotals({
  calories: 999,
  components: [
    { name: "Chicken salad", calories: 420, protein_g: 38, carbs_g: 18, net_carbs_g: 11, fat_g: 24, fiber_g: 7, hydration_ounces: 0, evidence_type: "photo_estimate" },
    { name: "Chicken salad", calories: 510, protein_g: 42, carbs_g: 20, net_carbs_g: 12, fat_g: 31, fiber_g: 8, hydration_ounces: 0, evidence_type: "description_estimate" },
    { name: "Unsweetened tea", calories: 0, protein_g: 0, carbs_g: 0, net_carbs_g: 0, fat_g: 0, fiber_g: 0, hydration_ounces: 16, evidence_type: "description_estimate" }
  ]
});
assert.equal(clarifiedPhotoEstimate.components.length, 2);
assert.equal(clarifiedPhotoEstimate.duplicate_components_removed, 1);
assert.equal(clarifiedPhotoEstimate.calories, 510);
assert.equal(clarifiedPhotoEstimate.protein_g, 42);
assert.equal(clarifiedPhotoEstimate.hydration_ounces, 16);
console.log("Photo-description reconciliation checks passed.");
