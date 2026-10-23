import { createClient } from "npm:@supabase/supabase-js@2.54.0";
const headers = {"access-control-allow-origin":"*","access-control-allow-headers":"authorization, x-client-info, apikey, content-type","access-control-allow-methods":"POST, OPTIONS","content-type":"application/json","cache-control":"private, no-store"};
const json = (value: unknown, status=200) => new Response(JSON.stringify(value), {status,headers});
Deno.serve(async request => {
 if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
 if(request.method!=='POST') return json({error:'Method not allowed.'},405);
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!token) return json({error:'Authentication required.'},401);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key) return json({error:'Availability unavailable.'},503);
 try {
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user) return json({error:'Authentication required.'},401);
  const result=await admin.rpc('founding_license_availability');
  if(result.error||!result.data) return json({error:'Availability unavailable.'},503);
  return json(result.data);
 } catch { return json({error:'Availability unavailable.'},503); }
});
