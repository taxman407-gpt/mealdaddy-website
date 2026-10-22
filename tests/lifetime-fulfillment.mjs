import assert from 'node:assert/strict';
import {fulfillLifetimeCheckout} from '../supabase/functions/_shared/lifetime-fulfillment.mjs';
const session={id:'cs_fixture',mode:'payment',payment_status:'paid',payment_intent:'pi_fixture',amount_total:35000,currency:'usd',client_reference_id:'user-a',metadata:{user_id:'user-a',plan_key:'core',license_kind:'purchase',billing_purpose:'lifetime_license'}};
const quote={user_id:'user-a',plan_key:'core',kind:'purchase',price_id:'price_fixture',amount_cents:35000};
async function exercise(overrides={},quoteOverride=quote,lineOverrides={}){
 let grants=0;const filters=[];
 const admin={from(table){const q={select(){return q;},update(){return q;},eq(k,v){filters.push([k,v]);return q;},async maybeSingle(){return {data:quoteOverride,error:null};},then(resolve){return Promise.resolve({error:null}).then(resolve);}};return q;},async rpc(name,args){assert.equal(name,'record_lifetime_payment');assert.equal(args.requested_user_id,'user-a');grants++;return {data:grants===1,error:null};}};
 const stripe={checkout:{sessions:{async listLineItems(){return {data:[{quantity:1,price:{id:'price_fixture',unit_amount:35000,currency:'usd'},...lineOverrides}],has_more:false};}}}};
 const result=await fulfillLifetimeCheckout({session:{...session,...overrides},admin,stripe,paidAt:'2026-10-22T12:00:00Z'});return {result,grants,filters};
}
assert.equal((await exercise()).grants,1);
assert.equal((await exercise({payment_status:'unpaid'})).grants,0);
assert.equal((await exercise({mode:'subscription'})).result.handled,false);
await assert.rejects(exercise({client_reference_id:'other-user'}),/OWNER_MISMATCH/);
await assert.rejects(exercise({},null),/QUOTE_MISSING/);
await assert.rejects(exercise({payment_intent:null}),/PAYMENT_INVALID/);
await assert.rejects(exercise({},quote,{quantity:2}),/PRICE_MISMATCH/);
console.log('Lifetime fulfillment: paid+owned+quoted only, pending payment and forged ownership/price rejected.');
