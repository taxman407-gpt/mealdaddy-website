import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../app/saved-foods.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");

assert.match(script, /class="saved-food-quick-log"[^>]+type="submit"[^>]+form=/);
assert.match(script, /<details class="saved-food-details">/);
assert.match(script, /<summary><span><strong>/);
assert.match(script, /Log with these choices/);
assert.match(styles, /\.saved-food-details > summary[\s\S]*width: 100%/);

console.log("Compact saved-favorite list checks passed.");
