import assert from "node:assert/strict";
import {
  favoriteMealEvidence,
  favoriteMealFromEstimate,
  normalizeFavoriteComponents
} from "../app/favorite-meal.js";

const components = normalizeFavoriteComponents([
  {
    name: "Nature's Own low-carb bread",
    calories: 35,
    protein_g: 6,
    carbs_g: 10,
    net_carbs_g: 1,
    fat_g: 1,
    fiber_g: 9,
    hydration_ounces: 0,
    evidence_type: "nutrition_label",
    confidence: "high"
  },
  {
    name: "Scrambled eggs",
    calories: 210,
    protein_g: 18,
    carbs_g: 2,
    net_carbs_g: 2,
    fat_g: 15,
    fiber_g: 0,
    hydration_ounces: 0,
    evidence_type: "description_estimate",
    confidence: "medium"
  }
]);

assert.equal(favoriteMealEvidence(components), "mixed_estimate");

const favorite = favoriteMealFromEstimate({
  description: "My usual scrambled eggs and low-carb toast",
  mealLabel: "Breakfast",
  estimate: {
    calories: 245,
    protein_g: 24,
    carbs_g: 12,
    net_carbs_g: 3,
    fat_g: 16,
    fiber_g: 9,
    hydration_ounces: 0,
    confidence: "medium",
    source: "nutrition_label_photo",
    components
  }
});

assert.equal(favorite.item_type, "home_meal");
assert.equal(favorite.evidence_type, "mixed_estimate");
assert.match(favorite.name, /Nature's Own low-carb bread/);
assert.match(favorite.notes, /Label values: Nature's Own low-carb bread/);
assert.match(favorite.notes, /Estimated from description: Scrambled eggs/);
assert.equal(favorite.net_carbs_g, 3);
assert.equal(favorite.components.length, 2);

console.log("Favorite-meal evidence checks passed.");
