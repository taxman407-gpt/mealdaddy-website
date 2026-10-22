import assert from 'node:assert/strict';
import {applyReferralInvoiceDiscount} from '../supabase/functions/_shared/referral-discount.mjs';
const invoice={id:'in_fixture',status:'draft',currency:'usd',customer:'cus_fixture',amount_due:699,period_start:1792666800};
async function exercise({status='reserved',existing=false,hasMore=false,failSave=false}={}){
 let creates=0,updated=false;
 const admin={async rpc(name,args){assert.equal(name,'claim_referral_invoice_discount');assert.equal(args.requested_max_cents,699);return {data:{id:'redemption-fixture',status,amount_cents:500},error:null};},from(){const q={update(value){assert.equal(value.status,'applied');updated=true;return q;},eq(){return q;},then(resolve){return Promise.resolve({error:failSave?{}:null}).then(resolve);}};return q;}};
 const stripe={invoices:{async listLineItems(){return {data:existing?[{id:'il_existing',metadata:{mealdaddy_referral_redemption:'redemption-fixture'}}]:[],has_more:hasMore};}},invoiceItems:{async create(params,options){creates++;assert.equal(params.amount,-500);assert.equal(params.invoice,'in_fixture');assert.equal(params.discountable,false);assert.equal(options.idempotencyKey,'mealdaddy-referral-redemption-fixture');return {id:'ii_fixture'};}}};
 const result=await applyReferralInvoiceDiscount({invoice,userId:'user-a',admin,stripe});return {result,creates,updated};
}
assert.equal((await exercise()).creates,1);
assert.equal((await exercise({existing:true})).creates,0,'API retry must find the prior credit instead of duplicating it.');
assert.equal((await exercise({status:'applied'})).creates,0);
await assert.rejects(exercise({hasMore:true}),/RECONCILIATION_REQUIRED/);
await assert.rejects(exercise({failSave:true}),/RECONCILIATION_REQUIRED/);
assert.equal((await applyReferralInvoiceDiscount({invoice:{...invoice,status:'paid'}})).applied,false);
console.log('Referral discounts: invoice-bound credit, existing promotions preserved, API/DB replay protected and reconciliation failures explicit.');
