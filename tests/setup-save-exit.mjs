import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../app/setup.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../app/setup.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");

assert.match(html, /id="save-exit-bottom"[^>]*>Save &amp; exit/);
assert.match(html, /class="setup-actions-forward"[\s\S]*id="save-exit-bottom"[\s\S]*id="setup-next"/);
assert.match(script, /async function saveAndExit\(\)/);
assert.match(script, /\$\("#save-exit"\)\.addEventListener\("click", saveAndExit\)/);
assert.match(script, /\$\("#save-exit-bottom"\)\.addEventListener\("click", saveAndExit\)/);
assert.match(styles, /\.setup-actions-forward/);

console.log("Setup bottom save-and-exit checks passed.");
