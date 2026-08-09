import assert from "node:assert/strict";
import {
  normalizeRestaurantPlan,
  restaurantOptionToSavedFood,
  safeRestaurantSourceUrl
} from "../app/restaurant-plan.js";

const rawOptions = ["A", "B", "C"].map((label, index) => ({
  title: `${label} customized meal`,
  order: "Grilled protein with vegetables",
  substitutions: ["Vegetables instead of pasta", "Sauce on the side"],
  why: "Fits the saved preference.",
  calories: 400 + index * 100,
  protein_g: 40,
  carbs_g: 18,
  net_carbs_g: 12,
  fat_g: 20,
  fiber_g: 6,
  confidence: "high",
  evidence_type: "restaurant_published",
  source_url: "https://example.com/nutrition"
}));

const plan = normalizeRestaurantPlan({
  restaurant: "Example Restaurant",
  overview: "Three choices.",
  source_checked_on: "2026-08-08",
  options: rawOptions
});

assert.ok(plan);
assert.deepEqual(plan.options.map((option) => option.label), ["A", "B", "C"]);
assert.deepEqual(plan.options.map((option) => option.fit), ["Best fit", "Balanced choice", "Treat option"]);
assert.equal(normalizeRestaurantPlan({ options: rawOptions.slice(0, 2) }), null);
assert.equal(safeRestaurantSourceUrl("javascript:alert(1)"), "");

const favorite = restaurantOptionToSavedFood(plan, plan.options[0]);
assert.equal(favorite.item_type, "restaurant_item");
assert.equal(favorite.brand_or_restaurant, "Example Restaurant");
assert.equal(favorite.evidence_type, "restaurant_published");
assert.match(favorite.notes, /Vegetables instead of pasta/);
assert.doesNotMatch(favorite.name, /Grilled protein with vegetables/);

const estimatedFavorite = restaurantOptionToSavedFood(plan, {
  ...plan.options[0],
  source_url: "",
  evidence_type: "restaurant_published"
});
assert.equal(estimatedFavorite.evidence_type, "restaurant_estimate");

console.log("Restaurant recommendation and favorite-meal checks passed.");
