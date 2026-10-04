import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../app/saved-foods.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");

assert.match(script, /class="saved-food-quick-log"[^>]+type="submit"[^>]+form=/);
assert.match(script, /class="saved-food-expand"[^>]+data-expand-saved-food[^>]+aria-expanded="false"/);
assert.match(script, /class="saved-food-expanded"[^>]+hidden/);
assert.match(script, /Log with these choices/);
assert.match(script, /const maxPinnedFoods = 3/);
assert.match(script, /data-pin-saved-food/);
assert.match(script, /filter\(\(item\) => item\.is_pinned\)\.length >= maxPinnedFoods/);
assert.match(script, /Number\(Boolean\(b\.is_pinned\)\) - Number\(Boolean\(a\.is_pinned\)\)/);
assert.match(script, /localeCompare\(displayName\(b\)/);
assert.match(styles, /\.saved-food-quick-log[\s\S]*width: 100%/);
assert.match(styles, /\.saved-food-expand/);

console.log("Compact saved-favorite list checks passed.");
