import assert from "node:assert/strict";
import { findSavedFoodMatch } from "../app/saved-foods.js";

const natureBread = {
  id: "nature-bread",
  name: "Life Keto Soft White Bread",
  brand_or_restaurant: "Nature's Own"
};

assert.equal(findSavedFoodMatch([natureBread], "Natures Own low carb bread")?.food.id, "nature-bread");
assert.equal(findSavedFoodMatch([natureBread], "low carb bread")?.food.id, "nature-bread");
assert.equal(findSavedFoodMatch([natureBread], "2 slices Natures Own bread")?.servings, 2);
assert.equal(findSavedFoodMatch([natureBread], "bread with eggs"), null);
assert.equal(findSavedFoodMatch([natureBread, { id: "other", name: "Low Carb Bread", brand_or_restaurant: "Other" }], "bread"), null);

console.log("Saved-food matching regression checks passed.");
