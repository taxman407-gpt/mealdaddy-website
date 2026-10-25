import assert from 'node:assert/strict';
import {runWelcomeDelivery} from '../scripts/run-welcome-delivery.mjs';
const base = {enabled: true, project: 'dkirmzthyynogkkaacmj', serviceKey: 'synthetic-test-key'};
let calls = [];
const mock = (results) => async (url, options) => {calls.push({url, options}); const result = results.shift(); if (result instanceof Error) throw result; return result;};
const reply = value => Response.json(value);
assert.deepEqual(await runWelcomeDelivery({fetchImpl: () => {throw Error('Must not run while disabled');}}), {enabled:false, processed:0});
for (const patch of [{project: 'attacker.invalid'}, {serviceKey: ''}, {limit: 6}]) await assert.rejects(runWelcomeDelivery({...base, ...patch, fetchImpl: () => {throw Error('Unexpected call');}}));
let r = await runWelcomeDelivery({...base, fetchImpl: mock([reply({ok:true, processed:1}), reply({ok:true, processed:0})])});
assert.equal(r.processed,1); assert.equal(calls.length,2);
assert.equal(calls[0].url,'https://dkirmzthyynogkkaacmj.supabase.co/functions/v1/process-welcome-email');
assert.equal(calls[0].options.redirect,'error'); assert.equal(calls[0].options.headers.authorization,'Bearer synthetic-test-key');
calls=[]; r=await runWelcomeDelivery({...base, fetchImpl:mock(Array.from({length:5},()=>reply({ok:true,processed:1})))});
assert.equal(r.processed,5); assert.equal(calls.length,5); assert.equal(r.batchLimitReached,true);
for (const response of [new Response('private provider details', {status:503}), new Error('synthetic-test-key'), reply({ok:false}), reply({ok:true,processed:999}), new Response('invalid')]) {
 calls=[]; await assert.rejects(runWelcomeDelivery({...base, fetchImpl:mock([response])}), error => !error.message.includes('synthetic-test-key') && !error.message.includes('private provider details'));
 assert.equal(calls.length,1,'Uncertain sends must not be immediately retried');
}
calls=[]; r=await runWelcomeDelivery({...base,fetchImpl:mock([reply({ok:true,enabled:false})])});assert.equal(r.enabled,false);assert.equal(calls.length,1);
console.log('Welcome scheduler: default off, fixed destinations, bounded sequential batches, disabled worker, no immediate retry or secret/response disclosure passed.');
