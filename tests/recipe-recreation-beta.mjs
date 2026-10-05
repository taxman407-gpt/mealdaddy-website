import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../app/app.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../app/app.js",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/recipe-recreation/index.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20261004220000_recipe_recreation_beta.sql",import.meta.url),"utf8");
const ownerFunction=readFileSync(new URL("../supabase/functions/manage-family-access/index.ts",import.meta.url),"utf8");
const ownerHtml=readFileSync(new URL("../app/feedback-insights.html",import.meta.url),"utf8");

assert.match(html,/Recreate a Favorite Meal[\s\S]*?Beta/);
assert.match(html,/Quick &amp; Close[\s\S]*?Detailed Recreation/);
assert.match(html,/You’re among the first people helping MealDaddy refine this feature/);
assert.match(app,/private[\s\S]*?shared[\s\S]*?Newly personalized/);
assert.match(app,/recipe_beta_feedback/);
assert.match(edge,/cache:"private",aiCostMicros:0/);
assert.match(edge,/cache:"shared",aiCostMicros:0/);
assert.match(edge,/requested_kind:"recipe-recreation"/);
assert.match(edge,/source_description:String\(recipe\.title/);
assert.doesNotMatch(edge,/source_description:genericSource/);
assert.match(migration,/create table if not exists public\.saved_recipes/);
assert.match(migration,/create table if not exists public\.shared_recipe_templates/);
assert.match(migration,/create table if not exists public\.recipe_beta_feedback/);
assert.match(migration,/request_kind text not null default 'legacy'/);
assert.match(ownerFunction,/action === "usage-summary"/);
assert.match(ownerHtml,/AI cost by feature/);
console.log("Recipe recreation beta, caching, feedback, and accounting checks passed.");
