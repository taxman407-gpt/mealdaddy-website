import assert from "node:assert/strict";
import { consumedPortion, isEditedText, estimateInputText, textOnlyInstructions, validateEstimateEvidence, applyConsumedPortion, unchangedEntryUpdate, nutrientFields } from "../supabase/functions/_shared/estimate-edit-contract.mjs";
import { applyComponentTotals } from "../supabase/functions/_shared/nutrition-reconciliation.mjs";

const salad = "50% Restaurant salad with grilled chicken, no croutons. Dressing logged separately; do not include it.";
const portion = consumedPortion(salad);
assert.equal(portion.fraction, 0.5);
assert.equal(portion.explicit, true);
assert.ok(!portion.description.startsWith("50%"));
assert.equal(consumedPortion("1 oz vinaigrette (one third of a 3 oz cup)").fraction, 1);
assert.equal(consumedPortion("50% Salad", true).explicit, false);
assert.equal(consumedPortion("150% Soup").fraction, 1.5);
assert.throws(() => consumedPortion("1001% Soup"));
assert.equal(isEditedText({ nutrition_estimate: { input_authority: "edited_text", photo_path: "owner/old.jpg" } }), true);
const text = estimateInputText({ description: salad }, false, portion);
assert.ok(!text.includes("same photographed meal"));
assert.match(text, /No image was supplied/);
assert.match(textOnlyInstructions(portion), /exactly once/);
assert.match(textOnlyInstructions(consumedPortion("1 oz dressing")), /1 oz total/);
const values = Object.fromEntries(nutrientFields.map((key) => [key, 0]));
const estimate = { components: [
  { ...values, name: "Salad greens", calories: 100, fiber_g: 8, evidence_type: "description_estimate" },
  { ...values, name: "Grilled chicken", calories: 300, protein_g: 50, evidence_type: "description_estimate" }
], photo_description: "", label_detected: false };
assert.doesNotThrow(() => validateEstimateEvidence(estimate, false));
applyComponentTotals(applyConsumedPortion(estimate, portion));
assert.equal(estimate.calories, 200);
assert.equal(estimate.protein_g, 25);
assert.equal(estimate.fiber_g, 4);
assert.equal(estimate.consumed_fraction, 0.5);
assert.equal(estimate.components.length, 2);
const dressing = { components: [{ ...values, name: "1 oz vinaigrette", calories: 45, evidence_type: "description_estimate" }], photo_description: "", label_detected: false };
applyComponentTotals(applyConsumedPortion(dressing, consumedPortion("1 oz dressing (one third of 3 oz)")));
assert.equal(dressing.calories, 45);
assert.equal(dressing.components.length, 1);
assert.throws(() => validateEstimateEvidence({ ...dressing, photo_description: "Salad is visible" }, false));
assert.throws(() => validateEstimateEvidence({ ...dressing, components: [{ ...dressing.components[0], evidence_type: "photo_estimate" }] }, false));
assert.throws(() => validateEstimateEvidence({ ...dressing, label_detected: true }, false));
assert.throws(() => validateEstimateEvidence({ components: [] }, false));
assert.throws(() => validateEstimateEvidence({ ...dressing, components: [{ ...dressing.components[0], calories: NaN }] }, false));

// Model a late response and verify every compare-and-swap condition is present.
const filters = [];
let written;
const query = {
  update(value) { written = value; return this; },
  eq(key, value) { filters.push([key, value]); return this; },
  is(key, value) { filters.push([key, value]); return this; },
  select(value) { assert.equal(value, "id"); return this; },
  maybeSingle() { return Promise.resolve({ data: null, error: null }); }
};
const snapshot = { id: "entry", description: "New salad without dressing", kind: "meal", status: "pending_estimate", nutrition_estimate: { edit_revision: "revision-2", input_authority: "edited_text" } };
const outcome = await unchangedEntryUpdate({ from(name) { assert.equal(name, "ledger_entries"); return query; } }, "member", snapshot, { nutrition_estimate: estimate, status: "estimated" });
assert.equal(outcome.data, null);
assert.deepEqual(filters.map(([key]) => key), ["id", "user_id", "description", "kind", "status", "nutrition_estimate"]);
assert.equal(JSON.parse(filters.at(-1)[1]).edit_revision, "revision-2");
assert.equal(written.nutrition_estimate, estimate);
filters.length = 0;
await unchangedEntryUpdate({ from: () => query }, "member", { ...snapshot, nutrition_estimate: null }, {});
assert.deepEqual(filters.at(-1), ["nutrition_estimate", null]);
console.log("Meal edit replacement, no invented photo evidence, single portion scaling, and stale-result filters passed.");
