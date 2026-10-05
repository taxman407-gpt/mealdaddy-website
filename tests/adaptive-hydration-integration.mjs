import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app/app.js", import.meta.url), "utf8");
const setup = readFileSync(new URL("../app/setup.js", import.meta.url), "utf8");
const coach = readFileSync(new URL("../supabase/functions/coach-action/index.ts", import.meta.url), "utf8");
const website = ["../index.html", "../faq.html", "../instructions.html"].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

assert.match(setup, /hydration_target_source/);
assert.match(setup, /Clinician recommended/);
for (const field of ["hydrationOunces", "hydrationGoalOunces", "hydrationTargetSource", "sodiumMg", "sodiumGoalMg"]) {
  assert.match(app, new RegExp(field));
  assert.match(coach, new RegExp(field));
}
assert.match(coach, /Never raise or override the saved hydration target/);
assert.match(coach, /clinician-recommended target as a firm ceiling/);
assert.doesNotMatch(website, /raise the suggested hydration target|call for a higher target|bumps today's hydration target/i);

console.log("Adaptive Hydration integration checks passed.");
