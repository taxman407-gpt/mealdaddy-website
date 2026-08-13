import assert from "node:assert/strict";
import { favoriteStatusForEntry } from "../app/saved-foods.js";

const favorite = {
  id: "favorite-1",
  storage_scope: "sync",
  name: "Dinner salad",
  brand_or_restaurant: "",
  calories: 320,
  protein_g: 12,
  carbs_g: 18,
  net_carbs_g: 12,
  fat_g: 24,
  fiber_g: 6,
  sugar_alcohols_g: 0,
  allulose_g: 0,
  hydration_ounces: 3
};

const exact = favoriteStatusForEntry([favorite], {
  kind: "meal",
  description: "Dinner salad — 1 usual meal",
  nutrition_estimate: {
    source: "saved_food",
    saved_food_id: "favorite-1"
  }
});
assert.equal(exact?.status, "exact");
assert.equal(exact?.food.id, "favorite-1");

const edited = favoriteStatusForEntry([favorite], {
  kind: "meal",
  description: "Dinner salad with extra chicken",
  nutrition_estimate: {
    source: "description_estimate",
    calories: 510,
    protein_g: 38,
    carbs_g: 20,
    net_carbs_g: 14,
    fat_g: 31,
    fiber_g: 6,
    hydration_ounces: 3,
    favorite_origin: { key: "sync:favorite-1" }
  }
});
assert.equal(edited?.status, "edited");
assert.equal(edited?.food.id, "favorite-1");

const legacyEdited = favoriteStatusForEntry([favorite], {
  kind: "meal",
  description: "Dinner salad with salmon",
  nutrition_estimate: {
    source: "description_estimate",
    calories: 600,
    protein_g: 40
  }
});
assert.equal(legacyEdited?.status, "edited");

assert.equal(favoriteStatusForEntry([favorite], {
  kind: "meal",
  description: "Completely different meal",
  nutrition_estimate: { source: "description_estimate", calories: 200 }
}), null);

console.log("favorite status tests passed");
