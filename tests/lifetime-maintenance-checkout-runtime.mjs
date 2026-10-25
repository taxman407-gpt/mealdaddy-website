import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {addUtcYears} from '../supabase/functions/_shared/membership-policy.mjs';
const source=stripTypeScriptTypes(readFileSync('supabase/functions/create-license-checkout/index.ts','utf8').replace(/^import .*;\n/gm,''),{mode:'strip'});
async function run(purchasedAt,now,body={plan:'core_lifetime',kind:'maintenance'}) {
 let handler,stripeCalls=0;
 const admin={auth:{getUser:async()=>({data:{user:{id:'fixture'}},error:null})},from:table=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='lifetime_licenses'?{status:'paid',plan_key:'core',purchased_at:purchasedAt}:null,error:null})};return q;}};
 class Clock extends Date {static now(){return Date.parse(now);}}
 vm.runInNewContext(source,{URL,createClient:()=>admin,requireConditionalMfa:async()=>({ok:true}),addUtcYears,Date:Clock,Stripe:class {constructor(){stripeCalls++;throw Error('Stripe boundary reached');}},Deno:{env:{get:n=>n==='ENABLE_LIFETIME_BILLING'?'true':n==='SUPABASE_PUBLISHABLE_KEYS'?'{}':n==='APP_ORIGIN'?'https://fixture.test':'fixture'},serve:fn=>handler=fn},Response});
 try {const response=await handler(new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json(),stripeCalls};}
 catch(error){assert.equal(error.message,'Stripe boundary reached');return {stripeCalls};}
}
let r=await run('2026-10-25T00:00:00Z','2026-10-25T00:00:01Z');assert.equal(r.status,409);assert.equal(r.stripeCalls,0);assert.match(r.body.error,/three years/);
r=await run('2026-10-25T00:00:00Z','2029-10-24T23:59:59Z');assert.equal(r.status,409);assert.equal(r.stripeCalls,0);
r=await run('2026-10-25T00:00:00Z','2029-10-25T00:00:00Z');assert.equal(r.stripeCalls,1);
r=await run('2024-02-29T12:00:00Z','2027-02-28T11:59:59Z');assert.equal(r.stripeCalls,0);
r=await run('2024-02-29T12:00:00Z','2027-02-28T12:00:00Z');assert.equal(r.stripeCalls,1);
for(const body of [null,[],3]){r=await run('2026-10-25','2026-10-25',body);assert.equal(r.status,400);assert.equal(r.stripeCalls,0);}
console.log('Maintenance checkout: no Stripe access during three included years; exact anniversary/leap-day boundaries and malformed requests verified.');
