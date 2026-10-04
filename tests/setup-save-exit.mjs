import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../app/setup.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../app/setup.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app/app.js", import.meta.url), "utf8");
const account = readFileSync(new URL("../app/account.js", import.meta.url), "utf8");

assert.match(html, /id="save-exit-bottom"[^>]*>Save &amp; exit/);
assert.match(html, /class="setup-actions-forward"[\s\S]*id="save-exit-bottom"[\s\S]*id="setup-next"/);
assert.match(script, /async function saveAndExit\(\)/);
assert.match(script, /\$\("#save-exit"\)\.addEventListener\("click", saveAndExit\)/);
assert.match(script, /\$\("#save-exit-bottom"\)\.addEventListener\("click", saveAndExit\)/);
assert.match(script, /function safeReturnTarget\(value\)/);
assert.match(script, /location\.replace\(saveExitTarget\)/);
assert.match(script, /new Set\(\["app\.html", "account\.html"\]\)/, "setup returns should be limited to known MealDaddy pages");
assert.match(app, /requestedAppView[\s\S]*?appViews\.has\(requestedAppView\)/, "the app should restore a trusted originating tab");
assert.match(account, /accountReturnTarget[\s\S]*?#edit-setup-link/, "account editing should preserve the screen that opened it");
assert.match(styles, /\.setup-actions-forward/);

console.log("Setup bottom save-and-exit checks passed.");
