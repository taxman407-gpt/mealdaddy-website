import { createClient } from "npm:@supabase/supabase-js@2.54.0";
const headers = {"access-control-allow-origin":"*","access-control-allow-headers":"authorization, x-client-info, apikey, content-type","access-control-allow-methods":"POST, OPTIONS","content-type":"application/json","cache-control":"private, no-store"};
const json = (value: unknown, status=200) => new Response(JSON.stringify(value), {status,headers});
Deno.serve(async request => {
 if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
 if(request.method!=='POST') return json({error:'Method not allowed.'},405);
 // This endpoint exposes only the campaign aggregate, never member records.
 const apiKey=request.headers.get('apikey');
 let publishableKeys:string[]=[];
 try { publishableKeys=Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')) as string[]; } catch {}
 const allowedKeys=[...publishableKeys,Deno.env.get('SUPABASE_ANON_KEY')].filter(Boolean);
 if(!apiKey||!allowedKeys.includes(apiKey)) return json({error:'Valid app API key required.'},401);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key) return json({error:'Availability unavailable.'},503);
 try {
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await admin.rpc('founding_license_availability');
  if(result.error||!result.data) return json({error:'Availability unavailable.'},503);
  return json(result.data);
 } catch { return json({error:'Availability unavailable.'},503); }
});
