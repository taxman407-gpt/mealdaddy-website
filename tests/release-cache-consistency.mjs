import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const serviceWorker = read("app/service-worker.js");
const shellMatch = serviceWorker.match(/const SHELL = (\[[^;]+\]);/);
assert.ok(shellMatch, "The service-worker shell manifest must be readable.");
const shell = JSON.parse(shellMatch[1]);

assert.match(serviceWorker, /mealdaddy-shell-v98/);
assert.match(read("worker.js"), /const release = "20261004-v98"/);

for (const page of ["app/index.html", "app/auth.html", "app/app.html", "app/account.html", "app/setup.html"]) {
  const html = read(page);
  const stylesheet = html.match(/href="(\.\/styles\.css\?v=[^"]+)"/)?.[1];
  assert.equal(stylesheet, "./styles.css?v=20261004-23", `${page} must use the v98 stylesheet.`);
}

for (const [page, expectedScript] of [
  ["app/auth.html", "./auth.js?v=20261004-1"],
  ["app/app.html", "./app.js?v=20261004-31"],
  ["app/account.html", "./account.js?v=20261004-7"],
  ["app/setup.html", "./setup.js?v=20261004-8"]
]) {
  const html = read(page);
  assert.ok(html.includes(expectedScript), `${page} must reference ${expectedScript}.`);
  assert.ok(shell.includes(expectedScript), `The service worker must cache ${expectedScript}.`);
}

for (const asset of [
  "./styles.css?v=20261004-23",
  "./saved-foods.js?v=20261004-11",
  "./restaurant-plan.js?v=20261004-1",
  "./private-image.js?v=20261004-1",
  "./supabase-client.js?v=20261004-1"
]) {
  assert.ok(shell.includes(asset), `The service worker must cache ${asset}.`);
}

for (const staleVersion of [
  "mealdaddy-shell-v97",
  "styles.css?v=20261004-22",
  "mealdaddy-shell-v96",
  "styles.css?v=20261004-21",
  "app.js?v=20261004-30",
  "mealdaddy-shell-v95",
  "styles.css?v=20261004-20",
  "auth.js?v=20260813-5",
  "app.js?v=20261004-29",
  "account.js?v=20261004-6",
  "saved-foods.js?v=20261004-10",
  "restaurant-plan.js?v=20260813-4",
  "supabase-client.js?v=20260930-3"
]) {
  assert.ok(!serviceWorker.includes(staleVersion), `The service worker still contains stale ${staleVersion}.`);
}

console.log("Release cache-consistency checks passed.");
