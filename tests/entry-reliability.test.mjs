import assert from "node:assert/strict";
import { validateEstimateResponse, withDeadline, readableFailure, photoValidationMessage, observeEstimateRequest, initializeEntryFeedback } from "../app/entry-reliability.js";
let assertions = 0;
function check(fn) { fn(); assertions++; }
const numbers = { calories: 100, protein_g: 10, carbs_g: 4, net_carbs_g: 3, fat_g: 5, fiber_g: 1 };
const valid = { ok: true, estimate: { ...numbers, components: [{ name: "Egg", ...numbers }] } };
check(() => assert.equal(validateEstimateResponse(valid, { requireComponents: true }), valid.estimate));
for (const value of [null, {}, {ok:true}, {ok:false,estimate:numbers}, {ok:true,estimate:{}}]) check(() => assert.throws(() => validateEstimateResponse(value)));
for (const value of [NaN, Infinity, -1, "100", null, undefined]) check(() => assert.throws(() => validateEstimateResponse({ok:true,estimate:{...numbers,calories:value}})));
for (const components of [undefined, [], [{name:"",...numbers}], [{name:"Egg",...numbers,protein_g:null}]]) check(() => assert.throws(() => validateEstimateResponse({ok:true,estimate:{...numbers,components}},{requireComponents:true})));
check(() => assert.doesNotThrow(() => validateEstimateResponse({ok:true,estimate:{calories:0,protein_g:0,carbs_g:0,net_carbs_g:0,fat_g:0,fiber_g:0}})));
check(() => assert.match(photoValidationMessage({name:"photo.heic",type:"image/heic",size:100}), /JPG\/PNG/));
check(() => assert.match(photoValidationMessage({name:"photo.jpg",type:"image/jpeg",size:9*1024*1024}), /8 MB/));
check(() => assert.match(photoValidationMessage({name:"foo.svg",type:"image/svg\+xml",size:5}), /JPG/));
check(() => assert.equal(photoValidationMessage({name:"photo.jpg",type:"image/jpeg",size:100}), ""));
check(() => assert.equal(photoValidationMessage(null), ""));
check(() => assert.equal(initializeEntryFeedback(),null));
assert.equal(await withDeadline(Promise.resolve(42),100,"late"),42); assertions++;
await assert.rejects(withDeadline(new Promise(()=>{}),5,"Still processing"), {name:"TimeoutError",message:"Still processing"}); assertions++;
assert.equal(await readableFailure({context:new Response(JSON.stringify({error:"Verify your session."}))}),"Verify your session."); assertions++;
assert.equal(await readableFailure(new Error("Offline")),"Offline"); assertions++;
assert.equal(await readableFailure({}),"The request could not be completed."); assertions++;
assert.equal((await observeEstimateRequest(async()=>({data:valid,error:null}),{entryId:"fixture",saveFavorite:false})).data,valid); assertions++;
for (const data of [null,{}, {ok:true}, {ok:true,estimate:{...numbers,source:"meal_photo_estimate"}}]) {
  assert.ok((await observeEstimateRequest(async()=>({data,error:null}),{entryId:"fixture"})).error); assertions++;
}
const denial=new Error("Authentication required.");
assert.equal((await observeEstimateRequest(async()=>({data:null,error:denial}),{})).error,denial); assertions++;
assert.equal((await observeEstimateRequest(()=>{throw new Error("Network unavailable")},{})).error.message,"Network unavailable"); assertions++;
let calls=0;
const timeout=await observeEstimateRequest(()=>{calls++;return new Promise(()=>{});},{entryId:"fixture"},{timeoutMs:5});
assert.equal(timeout.error.name,"TimeoutError");assert.equal(calls,1);assert.match(timeout.error.message,/do not log the meal again/);assertions+=3;
console.log(`${assertions} estimate validation, lifecycle, timeout, and format checks passed.`);
