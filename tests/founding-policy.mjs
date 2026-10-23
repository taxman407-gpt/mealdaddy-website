import assert from 'node:assert/strict';
import { foundingOfferState } from '../app/founding-policy.mjs';
assert.deepEqual(foundingOfferState(null),{visible:false,counter:''});
assert.deepEqual(foundingOfferState({capacity:2000,counterVisible:false,soldOut:false,remaining:null}),{visible:true,counter:''});
assert.deepEqual(foundingOfferState({capacity:2000,counterVisible:true,soldOut:false,remaining:1500}),{visible:true,counter:'1,500 Available'});
assert.deepEqual(foundingOfferState({capacity:2000,counterVisible:true,soldOut:false,remaining:200}),{visible:true,counter:'200 Available'});
assert.deepEqual(foundingOfferState({capacity:2000,counterVisible:true,soldOut:true,remaining:0}),{visible:false,counter:''});
assert.equal(foundingOfferState({capacity:2000,counterVisible:true,soldOut:false,remaining:-1}).visible,false);
console.log('Founding offer: hidden counter before threshold, exact Available label, sold-out hiding and invalid-data rejection passed.');
