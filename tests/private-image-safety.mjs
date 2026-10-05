import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const helper = read("app/private-image.js");
const app = read("app/app.js");
const foods = read("app/saved-foods.js");
const account = read("app/account.html");

assert.match(helper, /8 \* 1024 \* 1024/);
assert.match(helper, /new Set\(\["image\/jpeg", "image\/png", "image\/webp", "image\/gif"\]\)/);
assert.match(helper, /createImageBitmap/);
assert.match(helper, /context\.drawImage/);
assert.match(helper, /canvas\.toBlob/);
assert.match(helper, /"image\/jpeg"/);
assert.match(helper, /new File\(\[blob\]/);

assert.match(app, /import \{ preparePrivateImage \}/);
assert.ok((app.match(/await preparePrivateImage\(/g) ?? []).length >= 3, "Every meal-photo flow must prepare the image before upload.");
assert.doesNotMatch(app, /\.upload\(photoPath, (?:state\.coachPhoto|file|submittedPhoto),/);

assert.match(foods, /import \{ preparePrivateImage \}/);
assert.ok((foods.match(/await preparePrivateImage\(/g) ?? []).length >= 2, "Saved-food processing and retained photos must both be prepared.");
assert.doesNotMatch(foods, /\.upload\((?:path|photoPath), file,/);

assert.match(account, /remove embedded EXIF\/GPS metadata/i);

console.log("Private-image safety checks passed.");
