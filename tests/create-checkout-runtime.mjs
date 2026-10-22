import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {membershipPlans,assertPlanPrice} from '../supabase/functions/_shared/membership-policy.mjs';
const source=stripTypeScriptTypes(readFileSync('supabase/functions/create-checkout/index.ts','utf8').replace(/^import .*;\n/gm,''),{mode:'strip'});
async function exercise({plan='core',enabled=true,wrongPrice=false,current=false}={}){
 let handler,creates=0,reservations=0,captured;
 const client={auth:{async getUser(){return {data:{user:{id:'synthetic-user',email:'synthetic@example.invalid'}},error:null};}},from(table){const q={select(){return q;},eq(){return q;},upsert(){return q;},async maybeSingle(){return {data:table==='subscriptions'&&current?{status:'active'}:null,error:null};},then(resolve){return Promise.resolve({error:null}).then(resolve);}};return q;},async rpc(name){if(name==='reserve_weekly_subscription_trial'){reservations++;return {data:[{eligible:false}],error:null};}return {data:true,error:null};}};
 class Stripe{constructor() {this.prices={retrieve:async()=>({active:true,currency:'usd',unit_amount:wrongPrice?1:membershipPlans[plan]?.amountCents,type:'recurring',recurring:{interval:'month',interval_count:1}})};this.checkout={sessions:{create:async(value)=>{creates++;captured=value;return {id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/fixture',status:'open'};}}};}}
 const values={SUPABASE_URL:'https://synthetic.example.invalid',SUPABASE_ANON_KEY:'public-synthetic',SUPABASE_SERVICE_ROLE_KEY:'server-synthetic',STRIPE_SECRET_KEY:'rk_test_synthetic',APP_ORIGIN:'https://test.example.invalid',STRIPE_CORE_PRICE_ID:'price_core',STRIPE_BYO_PRICE_ID:'price_byo',ENABLE_BYOK:enabled?'true':'false'};
 vm.runInNewContext(source,{Stripe,createClient:()=>client,membershipPlans,assertPlanPrice,requireConditionalMfa:async()=>({ok:true}),Deno:{env:{get:key=>values[key]},serve:fn=>{handler=fn;}},Response,Request,URL,Intl,Date,Set,console});
 const response=await handler(new Request('https://test.invalid/create-checkout',{method:'POST',headers:{authorization:'Bearer synthetic','content-type':'application/json'},body:JSON.stringify({plan})}));
 return {status:response.status,body:await response.json(),creates,reservations,captured};
}
for(const plan of ['core','byo']){const r=await exercise({plan});assert.equal(r.status,200);assert.equal(r.creates,1);assert.equal(r.captured.line_items[0].price,plan==='core'?'price_core':'price_byo');assert.equal(r.captured.metadata.plan_key,plan);assert.equal(r.reservations,plan==='core'?1:0);}
let r=await exercise({plan:'byo',enabled:false});assert.equal(r.status,503);assert.equal(r.creates,0);
r=await exercise({wrongPrice:true});assert.equal(r.status,503);assert.equal(r.creates,0);assert.equal(r.reservations,0);
r=await exercise({current:true});assert.equal(r.status,409);assert.equal(r.creates,0);
r=await exercise({plan:'unknown'});assert.equal(r.status,400);assert.equal(r.creates,0);
console.log('Checkout runtime: correct monthly prices, BYOK gate, duplicate membership and misconfigured price rejected before charging.');
