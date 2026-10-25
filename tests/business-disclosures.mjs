import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {membershipPlans} from '../supabase/functions/_shared/membership-policy.mjs';
const terms=readFileSync('terms.html','utf8');
const dollars=cents=>`$${(cents/100).toFixed(cents%100?2:0)}`;
for(const file of ['app/index.html','app/app.html']) {
 const html=readFileSync(file,'utf8');
 for(const plan of Object.values(membershipPlans))assert.ok(html.includes(dollars(plan.amountCents)),`${file} omits ${plan.name} price`);
 for(const key of ['core_lifetime','byo_lifetime'])assert.ok(html.includes(`${dollars(membershipPlans[key].maintenanceCents)}/year`),`${file} maintenance differs from checkout`);
}
for(const plan of Object.values(membershipPlans))assert.ok(terms.includes(dollars(plan.amountCents)));
assert.ok(terms.includes(`BYOK ${dollars(membershipPlans.byo_lifetime.maintenanceCents)}`));
assert.ok(terms.includes('60 days advance notice'));assert.ok(terms.includes('without paying for skipped years'));assert.ok(terms.includes('does not renew automatically'));
assert.ok(!terms.includes('Coming soon'));assert.ok(terms.includes('15%'));assert.ok(terms.includes('7.5%'));assert.ok(terms.includes('$5 per billing month'));
const privacy=readFileSync('privacy.html','utf8');for(const provider of ['OpenAI','Anthropic','Google Gemini'])assert.ok(privacy.includes(provider));
assert.ok(privacy.includes('device storage does not mean the key never leaves the device'));assert.ok(privacy.includes('can be stored in your protected account'));
console.log('Business disclosures: storefront/checkout/terms prices agree; maintenance, referral caps and actual provider/storage behavior disclosed.');
