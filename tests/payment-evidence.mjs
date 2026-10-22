import assert from 'node:assert/strict';
import {recordPaymentEvidence} from '../supabase/functions/_shared/payment-evidence.mjs';
const invoice={id:'in_fixture',status:'paid',amount_paid:999,currency:'usd',customer:'cus_fixture',status_transitions:{paid_at:1792627200}};
async function run({patch={},intentPatch={},paymentsPatch={},databaseError=false}={}){let row,calls=0;const result=await recordPaymentEvidence({invoice:{...invoice,...patch},userId:'fixture-user',subscriptionId:'sub_fixture',eventId:'evt_fixture',eventCreated:1792627200,stripe:{invoicePayments:{list:async()=>({has_more:false,data:[{amount_paid:999,payment:{type:'payment_intent',payment_intent:'pi_fixture'}}],...paymentsPatch})},paymentIntents:{retrieve:async()=>({customer:'cus_fixture',status:'succeeded',amount_received:999,...intentPatch})}},admin:{from:()=>({upsert:async value=>{row=value;calls++;return {error:databaseError?{}:null};}})}});return {result,row,calls};}
let r=await run();assert.equal(r.result,true);assert.equal(r.row.amount_paid_cents,999);assert.equal(r.row.user_id,'fixture-user');
for(const patch of [{amount_paid:0},{paid_out_of_band:true},{status:'draft'}]){r=await run({patch});assert.equal(r.result,false);assert.equal(r.calls,0);}
r=await run({paymentsPatch:{data:[]}});assert.equal(r.result,false);
for(const options of [{intentPatch:{customer:'wrong'}},{intentPatch:{status:'processing'}},{intentPatch:{amount_received:1}},{paymentsPatch:{has_more:true}},{databaseError:true}])await assert.rejects(()=>run(options));
console.log('Payment evidence: positive collected owned payments only; free, out-of-band, pending, mismatched and incomplete allocations excluded.');
