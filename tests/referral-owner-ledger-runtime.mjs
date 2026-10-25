import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=stripTypeScriptTypes(readFileSync('supabase/functions/manage-referrals/index.ts','utf8').replace(/^import .*;\n/gm,''),{mode:'strip'});
async function run({owner=true,mfa=true,authenticated=true,after,rows=[],failure=false,bodyOverride}={}) {
 let handler,ledgerReads=0;const filters=[];
 const client={auth:{getUser:async()=>({data:{user:authenticated?{id:'owner'}:null},error:null})},from:table=>{
  if(table==='referral_program_settings'){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{},error:null})};return q;}
  assert.equal(table,'affiliate_commissions');ledgerReads++;
  const q={select:fields=>{assert.equal(fields,'receipt_key,referrer_user_id,amount_cents,paid_out_cents,rate_basis_points');return q;},order:(...args)=>{filters.push(['order',...args]);return q;},limit:n=>{assert.equal(n,101);return q;},gt:(...args)=>{filters.push(['gt',...args]);return q;},then:resolve=>Promise.resolve({data:rows,error:failure?{}:null}).then(resolve)};return q;
 }};
 vm.runInNewContext(source,{createClient:()=>client,requireConditionalMfa:async()=>mfa?{ok:true}:{ok:false,status:403,error:'MFA required'},requireOwnerAuthorization:async()=>owner?{ok:true}:{ok:false,status:403,error:'Owner required'},Deno:{env:{get:name=>name==='SUPABASE_PUBLISHABLE_KEYS'?'{}':'fixture'},serve:fn=>handler=fn},Response});
 const response=await handler(new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify(bodyOverride===undefined?{action:'owner_commissions',...(after===undefined?{}:{after})}:bodyOverride)}));
 return {status:response.status,body:await response.json(),ledgerReads,filters,headers:response.headers};
}
for(const options of [{owner:false},{mfa:false},{authenticated:false}]){const r=await run(options);assert.ok([401,403].includes(r.status));assert.equal(r.ledgerReads,0);}
for(const after of [123,'x'.repeat(513),'bad\ncursor']){const r=await run({after});assert.equal(r.status,400);assert.equal(r.ledgerReads,0);}
for(const bodyOverride of [null,[],42,'invalid']){const r=await run({bodyOverride});assert.equal(r.status,400);assert.equal(r.ledgerReads,0);}
let r=await run();assert.equal(r.status,200);assert.deepEqual(r.body.rows,[]);assert.equal(r.body.nextCursor,null);assert.equal(r.headers.get('cache-control'),'no-store');
const rows=Array.from({length:101},(_,i)=>({receipt_key:`receipt-${String(i).padStart(3,'0')}`,referrer_user_id:'affiliate',amount_cents:0,paid_out_cents:150,rate_basis_points:1500}));
r=await run({rows,after:'receipt-before'});assert.equal(r.body.rows.length,100);assert.equal(r.body.nextCursor,'receipt-099');assert.ok(r.filters.some(x=>x[0]==='gt'&&x[1]==='receipt_key'&&x[2]==='receipt-before'));assert.equal(r.body.rows[0].paid_out_cents,150,'Refunds must preserve recorded payouts for reconciliation');
r=await run({failure:true});assert.equal(r.status,503);assert.equal(r.body.rows,undefined);
console.log('Owner commissions: owner/MFA enforcement, cursor validation, bounded pagination, refund/payout evidence and fail-closed query errors passed.');
