import {validateWelcomeTemplate} from '../_shared/welcome-template.mjs';
import {PRIVATE_BETA_DEPLOYMENT} from '../_shared/beta-deployment.mjs';
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
 if(!url||!service||!anon)return json({error:'Welcome editor unavailable.'},503);
 const auth=createClient(url,anon,{global:{headers:{Authorization:authorization}}});const {data:{user},error:authError}=await auth.auth.getUser();if(authError||!user)return json({error:'Authentication required.'},401);
 const admin=createClient(url,service);const owner=await requireOwnerAuthorization(admin,user,authorization);if(!owner.ok)return json({error:owner.error},owner.status);
 let body;try{body=await request.json();}catch{return json({error:'Invalid request.'},400);}
 const channel=PRIVATE_BETA_DEPLOYMENT?'beta':'live';
 const action=body.action||'view';
 if(!['view','save_draft','publish'].includes(action))return json({error:'Unknown action.'},400);
 if(action==='view'){
  const {data,error}=await admin.from('welcome_email_templates').select('*').eq('channel',channel).single();
  if(error||!data)return json({error:'Welcome editor is not installed.'},503);
  return json({ok:true,channel,template:data});
 }
 if(!Number.isSafeInteger(body.revision)||body.revision<1)return json({error:'Reload the editor before saving.'},400);
 let template;try{template=validateWelcomeTemplate(body.template);}catch(error){return json({error:error.message},422);}
 const {data,error}=await admin.rpc('edit_welcome_template',{requested_channel:channel,requested_action:action,expected_revision:body.revision,requested_subject:template.subject,requested_body:template.body,requested_owner:user.id});
 if(error)return json({error:'The template could not be saved.'},503);
 if(!data)return json({error:'This template changed in another window. Reload it before saving; your text has been kept here.'},409);
 return json({ok:true,channel,template:data});
});
