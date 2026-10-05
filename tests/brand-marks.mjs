import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app/app.html", import.meta.url), "utf8");
const account = readFileSync(new URL("../app/account.html", import.meta.url), "utf8");
const terms = readFileSync(new URL("../terms.html", import.meta.url), "utf8");

for (const mark of ["Nutrition Tracking Engine™", "Adaptive Hydration™", "Inflammation Score™ System", "One Meal, One Entry™", "Goal-to-Table Loop™"]) {
  assert.ok(app.includes(mark), `${mark} should appear in the app`);
  assert.ok(account.includes(mark), `${mark} should appear in account information`);
  assert.ok(terms.includes(mark), `${mark} should appear in the draft terms`);
}
assert.doesNotMatch(app + account + terms, /®/);

console.log("Brand-mark consistency checks passed.");
