import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const testConfig = JSON.parse(readFileSync(new URL("../wrangler.test.jsonc", import.meta.url), "utf8"));
const productionConfig = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const workerSource = readFileSync(new URL("../worker.test.js", import.meta.url), "utf8");

test("development Worker is distinct and cannot use production routing", () => {
  assert.equal(testConfig.name, "mealdaddy-october-test");
  assert.equal(testConfig.main, "./worker.test.js");
  assert.notEqual(testConfig.name, productionConfig.name);
  assert.equal(testConfig.workers_dev, true);
  assert.equal(testConfig.preview_urls, true);
  assert.equal(testConfig.routes, undefined);
  assert.equal(testConfig.route, undefined);
});

test("preview is fail-closed until test-only services are connected", async () => {
  assert.match(workerSource, /status:\s*503/);
  assert.match(workerSource, /productionConnected:\s*false/);
  assert.doesNotMatch(workerSource, /egbieqvbwniaxgqjzqkp|www\.mealdaddy\.ai|ASSETS\.fetch|supabase\.functions\.invoke/);
});

test("production Worker configuration remains distinct", () => {
  assert.equal(productionConfig.name, "mealdaddy-website");
  assert.equal(productionConfig.workers_dev, false);
  assert.equal(productionConfig.preview_urls, false);
});
