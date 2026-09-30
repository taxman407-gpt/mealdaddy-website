import assert from "node:assert/strict";
import { includePrimaryEatingStyle, resolvePrimaryEatingStyle } from "../app/profile-preferences.js";

assert.equal(resolvePrimaryEatingStyle({ dietStyle: "Low Carb", eatingStyles: ["Mediterranean", "Low Carb"] }), "Low Carb");
assert.equal(resolvePrimaryEatingStyle({ dietStyle: "Mediterranean", primaryEatingStyle: "Low Carb", eatingStyles: ["Mediterranean", "Low Carb"] }), "Low Carb");
assert.equal(resolvePrimaryEatingStyle({ eatingStyles: ["Mediterranean"] }), "Mediterranean");
assert.equal(resolvePrimaryEatingStyle({}), "Flexible");
assert.deepEqual(includePrimaryEatingStyle("Low Carb", ["Mediterranean"]), ["Low Carb", "Mediterranean"]);
assert.deepEqual(includePrimaryEatingStyle("Low-carb", ["Low Carb", "Mediterranean"]), ["Low Carb", "Mediterranean"]);

console.log("profile preference tests passed");
