import assert from 'node:assert/strict';
import { foundingOfferState } from '../app/founding-policy.mjs';
assert.equal(foundingOfferState(null).visible,false);
for(const remaining of [2000,1999,1500,425,200,50,1]) {
 const value={capacity:2000,soldOut:false,remaining};
 assert.equal(foundingOfferState(value).counter,`${remaining.toLocaleString('en-US')} Available`);
 assert.equal(foundingOfferState(value,{standard:true}).counter,`${remaining.toLocaleString('en-US')} Available`);
}
const closed={capacity:2000,soldOut:true,remaining:0};
assert.deepEqual(foundingOfferState(closed),{visible:true,counter:'',regular:true});
assert.deepEqual(foundingOfferState(closed,{standard:true}),{visible:true,counter:'',regular:true});
assert.equal(foundingOfferState({capacity:2000,soldOut:false,remaining:-1}).visible,false);
console.log('Separate Founding bars: visible from 2,000, exact labels, BYOK hiding and Standard regular transition passed.');
