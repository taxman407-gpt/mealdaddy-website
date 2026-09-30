import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../app/app.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../app/app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");

for (const view of ["today", "log", "entries", "plan", "more"]) {
  assert.match(html, new RegExp(`data-app-nav="${view}"`));
}
for (const subview of ["foods", "reports", "feedback", "tool"]) {
  assert.match(js + css, new RegExp(`(?:showAppSubview\\([^)]*"${subview}"|data-app-subview="${subview}")`));
}
assert.doesNotMatch(js.slice(0, js.indexOf("const user = session.user")), /scrollIntoView/);
assert.match(html, /data-subview-back="plan"/);
assert.match(html, /data-subview-back="log"/);
assert.match(html, /data-subview-back="more"/);

console.log("Version 1 screen navigation checks passed.");
