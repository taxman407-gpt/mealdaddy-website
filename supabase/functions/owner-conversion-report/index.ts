import {createClient} from "npm:@supabase/supabase-js@2.54.0";
import {requireOwnerAuthorization} from "../_shared/owner-authorization.ts";
const origins=new Set(['https://www.mealdaddy.ai','https://mealdaddy.ai','https://mealdaddy-october-test.taxman407.workers.dev']);
Deno.serve(async request=>{
 const origin=request.headers.get('origin');
 const headers={'content-type':'application/json','cache-control':'no-store','vary':'Origin',...(origin&&origins.has(origin)?{'access-control-allow-origin':origin}:{}),'access-control-allow-headers':'authorization, x-client-info, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'};
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(origin&&!origins.has(origin))return json({error:'Origin is not permitted.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return json({error:'Authentication required.'},401);
 const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');let anon=Deno.env.get('SUPABASE_ANON_KEY');try{anon=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||anon;}catch{}
 if(!url||!service||!anon)return json({error:'Report unavailable.'},503);
 const auth=createClient(url,anon,{global:{headers:{Authorization:authorization}}});const {data:{user},error:authError}=await auth.auth.getUser();if(authError||!user)return json({error:'Authentication required.'},401);
 const admin=createClient(url,service);const owner=await requireOwnerAuthorization(admin,user,authorization);if(!owner.ok)return json({error:owner.error},owner.status);
 let body;try{body=await request.json();}catch{return json({error:'Invalid request.'},400);}
 const action=body.action||'view';if(!['view','export'].includes(action))return json({error:'Unknown action.'},400);
 const date=(value:unknown)=>value===null||value===undefined||value===''?null:typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():false;
 const from=date(body.from),to=date(body.to),offset=body.offset??0,limit=body.limit??100;
 const statuses=['complimentary','lifetime_paid','active_trial','paid_active','unknown_reconciliation','past_due','canceled','unpaid','incomplete_expired','incomplete_checkout','registered_no_linked_subscription'];
 if(from===false||to===false||(from&&to&&from>=to)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>500||body.status&&!statuses.includes(body.status)||body.verified&&!['verified','unverified'].includes(body.verified)||body.marketing&&!['opted_in','opted_out','unknown'].includes(body.marketing))return json({error:'Invalid filters or pagination.'},400);
 const filters={requested_from:from,requested_to:to,requested_status:body.status||null,requested_verified:body.verified||null,requested_marketing:body.marketing||null,requested_offset:offset,requested_limit:limit};
 const {data,error}=await admin.rpc('owner_conversion_report',filters);if(error||!data)return json({error:'Report could not be read.'},503);
 const {error:auditError}=await admin.from('owner_report_audit').insert({owner_id:user.id,action,filters,row_count:data.rows.length});if(auditError)return json({error:'Report access could not be audited; no data was returned.'},503);
 return json({ok:true,...data,offset,limit,notes:['No linked subscription is not proof that no Stripe payment occurred.','Paid conversions require positive verified payment evidence; missing historical evidence requires reconciliation.','Trial start and welcome delivery dates are not recorded by this report yet.']});
});
