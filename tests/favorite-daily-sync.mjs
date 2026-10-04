import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/saved-foods.js", import.meta.url), "utf8");

assert.match(source, /async function syncFavoriteEntries\(food, previousFood, scope\)/, "favorite edits should have a selectable ledger synchronization path");
assert.match(source, /scope === "today"[\s\S]*?\.gte\("occurred_at", start\.toISOString\(\)\)\.lt\("occurred_at", end\.toISOString\(\)\)/, "the default correction scope should be able to target today's entries");
assert.match(source, /origin\.id === previousFood\.id \|\| origin\.key === previousKey/, "every historical entry linked to the favorite should be selected");
assert.match(source, /Promise\.all\(matches\.slice\(index, index \+ 25\)\.map/, "all matching favorite entries should be updated in safe batches");
assert.match(source, /favorite_origin:[\s\S]*?servings: multiplier/, "new favorite entries should retain their serving multiplier for later corrections");
assert.match(source, /updateScope !== "future"[\s\S]*?syncFavoriteEntries\(currentFood, previousFood, updateScope\)/, "future-only edits should preserve history while selected scopes synchronize linked entries");
assert.match(source, /recipeDescriptionChanged && nutritionStayedIdentical[\s\S]*?reviewed those values and they are still correct/, "recipe edits should not silently retain stale nutrition values");

console.log("Favorite correction scope checks passed.");
