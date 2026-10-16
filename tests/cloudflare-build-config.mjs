import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workspace = read("pnpm-workspace.yaml");
const wrangler = JSON.parse(read("wrangler.jsonc"));
const manifest = JSON.parse(read("package.json"));

// pnpm 9 requires a nonempty packages list even for a single-package project.
assert.match(workspace, /^packages:\s*\n\s+-\s+['"]\.['"]\s*$/m);
assert.match(workspace, /^allowBuilds:\s*\n\s+esbuild: true\s*$/m);
// Cloudflare may have no dashboard build command. Wrangler must create dist
// before publishing, rather than depending on a previous build/cache artifact.
assert.equal(wrangler.build?.command, "npm run build");
assert.equal(wrangler.assets.directory, "./dist");
assert.equal(wrangler.assets.run_worker_first, true);
assert.equal(wrangler.workers_dev, false);
assert.equal(wrangler.preview_urls, false);
assert.match(manifest.scripts.build, /esbuild/);
assert.match(manifest.scripts.build, /node scripts\/build-netlify\.mjs/);
assert.doesNotMatch(manifest.scripts.build, /wrangler\s+(?:deploy|versions)/);
console.log("Cloudflare pnpm workspace and automatic public-build checks passed.");
