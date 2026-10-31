import assert from 'node:assert/strict';
import {requireAdultEligibility} from '../supabase/functions/_shared/adult-eligibility.mjs';
const admin=(data,error=null)=>({from(table){assert.equal(table,'adult_eligibility');const q={select(){return q;},eq(key,id){assert.equal(key,'user_id');assert.equal(id,'fixture-user');return q;},async maybeSingle(){return {data,error};}};return q;}});
assert.deepEqual(await requireAdultEligibility(admin({confirmed_adult:true,policy_version:1}),'fixture-user'),{ok:true});
for(const data of [null,{confirmed_adult:false,policy_version:1},{confirmed_adult:true,policy_version:0}])assert.equal((await requireAdultEligibility(admin(data),'fixture-user')).status,403);
assert.equal((await requireAdultEligibility(admin(null,Error('fixture')),'fixture-user')).status,503);
console.log('Adult eligibility: explicit current-policy confirmation required; absent, false, stale and failed lookups denied.');
