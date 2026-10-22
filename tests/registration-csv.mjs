import assert from 'node:assert/strict';
import {registrationCsv} from '../app/report-csv.js';
const text=registrationCsv([{email:'=HYPERLINK("https://example.invalid")',conversion_status:'paid_active',password_hash:'MUST_NOT_EXPORT',registered_at:'2026-10-22'},{email:' \t+malicious',plan_key:'core'},{email:'@SUM(1,2)'},{email:'-1+2'}]);
assert.ok(!text.includes('MUST_NOT_EXPORT'));assert.ok(!text.includes('password_hash'));assert.ok(text.includes('"\'=HYPERLINK(""https://example.invalid"")"'));assert.ok(text.includes('"\' \t+malicious"'));assert.ok(text.includes('"\'@SUM(1,2)"'));assert.ok(text.includes('"\'-1+2"'));assert.equal(text.split('\r\n').length,5);
console.log('Registration CSV: formula prefixes, whitespace, quotes and internal-column exclusion passed.');
