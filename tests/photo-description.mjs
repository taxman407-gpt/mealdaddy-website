import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const edge = readFileSync(new URL("../supabase/functions/estimate-entry/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../app/app.js", import.meta.url), "utf8");

assert.match(edge, /entry_description/);
assert.match(edge, /photo_description/);
assert.match(edge, /description_reconciliation_note/);
assert.match(edge, /not a second meal and not automatically an additional component/);
assert.match(edge, /Never count a pictured item once from the image and again from the typed clarification/);
assert.match(edge, /description: photoPath && generatedDescription/);
assert.match(edge, /needsPhotoDescription/);
assert.match(app, /estimateData\?\.entryDescription/);
assert.match(app, /entry\.description\.trim\(\)\.toLowerCase\(\) === "meal photo"/);
assert.match(app, /descriptionReconciliationNote/);
console.log("Photo-description reconciliation checks passed.");
