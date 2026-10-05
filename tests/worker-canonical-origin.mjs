import assert from "node:assert/strict";
import worker from "../worker.js";

const env = {
  ASSETS: {
    fetch: async (request) => new Response(new URL(request.url).pathname, { status: 200 })
  }
};

const insecure = await worker.fetch(new Request("http://www.mealdaddy.ai/app/app.html?view=today"), env);
assert.equal(insecure.status, 308);
assert.equal(insecure.headers.get("location"), "https://www.mealdaddy.ai/app/app.html?view=today");

const apex = await worker.fetch(new Request("https://mealdaddy.ai/privacy.html"), env);
assert.equal(apex.status, 308);
assert.equal(apex.headers.get("location"), "https://www.mealdaddy.ai/privacy.html");

const alternate = await worker.fetch(new Request("https://mealdaddy-website.example.workers.dev/app/"), env);
assert.equal(alternate.status, 308);
assert.equal(alternate.headers.get("location"), "https://www.mealdaddy.ai/app/");

const local = await worker.fetch(new Request("http://localhost:8787/health"), env);
assert.equal(local.status, 200);
assert.equal(await local.text(), "/health");
assert.equal(local.headers.get("x-frame-options"), "DENY");

const htmlEnv = {
  ASSETS: {
    fetch: async () => new Response("<!doctype html><title>MealDaddy</title>", {
      headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=0" }
    })
  }
};
const html = await worker.fetch(new Request("https://www.mealdaddy.ai/privacy.html"), htmlEnv);
assert.match(html.headers.get("cache-control"), /(?:^|,)\s*no-transform\s*(?:,|$)/i);

console.log("Worker canonical-origin checks passed.");
