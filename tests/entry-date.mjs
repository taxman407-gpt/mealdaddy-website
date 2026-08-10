import assert from "node:assert/strict";
import {
  entryDateDisplayLabel,
  localDateValue,
  occurredAtForEntryDate,
  quickDateOptions
} from "../app/entry-date.js";

const now = new Date(2026, 7, 10, 8, 35, 12, 250);
assert.equal(localDateValue(now), "2026-08-10");

const options = quickDateOptions(now, 3);
assert.deepEqual(options.map((option) => option.value), [
  "2026-08-10",
  "2026-08-09",
  "2026-08-08",
  "2026-08-07"
]);
assert.match(options[0].label, /^Today/);
assert.match(options[1].label, /^Yesterday/);

const yesterday = new Date(occurredAtForEntryDate("2026-08-09", now));
assert.equal(yesterday.getFullYear(), 2026);
assert.equal(yesterday.getMonth(), 7);
assert.equal(yesterday.getDate(), 9);
assert.equal(yesterday.getHours(), 8);
assert.equal(yesterday.getMinutes(), 35);
assert.equal(entryDateDisplayLabel("2026-08-09", now), "yesterday");

assert.throws(() => occurredAtForEntryDate("2026-08-11", now), /future/);
assert.throws(() => occurredAtForEntryDate("2026-02-30", now), /valid date/);

console.log("Backdated-entry checks passed.");
