import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/app.js", import.meta.url), "utf8");

assert.match(app, /profile\.name \|\| user\.user_metadata\?\.first_name \|\| ""/);
assert.match(app, /"Welcome back\. Good to see you\."/);
assert.match(app, /return `\$\{state\.preferredName\}, \$\{message\.charAt\(0\)\.toLocaleLowerCase\(\)\}\$\{message\.slice\(1\)\}`/);
assert.match(app, /title\.textContent = personalTitle\("Ready when you are\."\)/);
assert.match(app, /title\.textContent = personalTitle\(affirmations/);

console.log("Preferred-name guidance checks passed.");
