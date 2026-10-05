import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { requireConditionalMfa } from "../_shared/conditional-mfa.ts";

const model = "gpt-5-mini";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS", "content-type": "application/json" };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: cors });
const outputText = (response: any) => (response.output || []).flatMap((item: any) => item.content || []).find((part: any) => part.type === "output_text")?.text || "";
async function sha(value: string) { const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((b)=>b.toString(16).padStart(2,"0")).join(""); }
function namedKey(variable:string,fallback:string){try{return JSON.parse(Deno.env.get(variable)??"{}").default??Deno.env.get(fallback)}catch{return Deno.env.get(fallback)}}

const recipeFormat = { type:"json_schema", name:"favorite_recipe", strict:true, schema:{ type:"object", properties:{
  title:{type:"string"}, summary:{type:"string"}, servings:{type:"number",minimum:1,maximum:24}, detail_level:{type:"string",enum:["quick","detailed"]},
  ingredients:{type:"array",items:{type:"object",properties:{amount:{type:"string"},item:{type:"string"}},required:["amount","item"],additionalProperties:false}},
  shopping_list:{type:"array",items:{type:"object",properties:{department:{type:"string"},items:{type:"array",items:{type:"string"}}},required:["department","items"],additionalProperties:false}},
  instructions:{type:"array",items:{type:"string"}}, substitutions:{type:"array",items:{type:"string"}}, personalization:{type:"array",items:{type:"string"}},
  nutrition:{type:"object",properties:{calories:{type:"number",minimum:0},protein_g:{type:"number",minimum:0},carbs_g:{type:"number",minimum:0},net_carbs_g:{type:"number",minimum:0},fat_g:{type:"number",minimum:0},fiber_g:{type:"number",minimum:0},sodium_mg:{type:"number",minimum:0},inflammation_score:{type:"number",minimum:0,maximum:10}},required:["calories","protein_g","carbs_g","net_carbs_g","fat_g","fiber_g","sodium_mg","inflammation_score"],additionalProperties:false},
  source_note:{type:"string"}
},required:["title","summary","servings","detail_level","ingredients","shopping_list","instructions","substitutions","personalization","nutrition","source_note"],additionalProperties:false }};

Deno.serve(async (request) => {
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  if(request.method!=="POST") return json({error:"Method not allowed."},405);
  const auth=request.headers.get("authorization"); if(!auth?.startsWith("Bearer ")) return json({error:"Authentication required."},401);
  const url=Deno.env.get("SUPABASE_URL"), anon=namedKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"), secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??namedKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY"), apiKey=Deno.env.get("OPENAI_API_KEY");
  if(!url||!anon||!secret||!apiKey) return json({error:"Recipe recreation is not configured."},503);
  const authClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await authClient.auth.getUser(); if(!user) return json({error:"Authentication required."},401);
  let body:any; try{body=await request.json()}catch{return json({error:"Invalid request."},400)}
  const source=String(body.source||"").trim().slice(0,500), detail=body.detailLevel==="detailed"?"detailed":"quick", search=body.searchCurrent===true;
  if(source.length<3) return json({error:"Describe the favorite meal to recreate."},400);
  const admin=createClient(url,secret);
  const mfaResult=await requireConditionalMfa(admin,user.id,auth);
  if(!mfaResult.ok) return json({error:mfaResult.error},mfaResult.status);
  const {data:profileRow}=await admin.from("profiles").select("diet_style,onboarding_data").eq("user_id",user.id).maybeSingle();
  const profile=profileRow?.onboarding_data||{};
  const personalContext={diet_style:profileRow?.diet_style||"",eating_styles:profile.eating_styles||[],goals:profile.primary_goals||[],foods_to_avoid:profile.foods_to_avoid||"",medical_restrictions:profile.medical_restrictions||"",foods_disliked:profile.foods_disliked||"",cooking_for:profile.cooking_for||"",appliances:profile.appliances||[]};
  const genericSource=source.replace(/\b\d{5}(?:-\d{4})?\b/g,"").replace(/\s+/g," ").trim();
  const sharedKey=await sha(JSON.stringify({source:genericSource.toLowerCase(),detail,diet:personalContext.diet_style,styles:personalContext.eating_styles,goals:personalContext.goals,cooking_for:personalContext.cooking_for,appliances:personalContext.appliances}));
  const requestKey=await sha(JSON.stringify({sharedKey,personalContext,search}));
  const {data:privateHit}=await admin.from("saved_recipes").select("id,recipe,use_count").eq("user_id",user.id).eq("request_key",requestKey).maybeSingle();
  if(privateHit){await admin.from("saved_recipes").update({use_count:Number(privateHit.use_count||0)+1,last_used_at:new Date().toISOString()}).eq("id",privateHit.id); return json({ok:true,recipePlan:privateHit.recipe,savedRecipeId:privateHit.id,cache:"private",aiCostMicros:0,beta:true});}
  const hasSensitive=Boolean(String(personalContext.foods_to_avoid).trim()||String(personalContext.medical_restrictions).trim()||String(personalContext.foods_disliked).trim());
  const {data:sharedHit}=await admin.from("shared_recipe_templates").select("recipe,use_count,expires_at").eq("cache_key",sharedKey).neq("beta_status","retired").maybeSingle();
  const sharedFresh=sharedHit&&(!sharedHit.expires_at||new Date(sharedHit.expires_at)>new Date());
  if(sharedFresh&&!hasSensitive&&!search){
    const {data:saved,error:saveError}=await admin.from("saved_recipes").upsert({user_id:user.id,request_key:requestKey,source_description:source,detail_level:detail,recipe:sharedHit.recipe,shared_template_key:sharedKey,last_used_at:new Date().toISOString()},{onConflict:"user_id,request_key"}).select("id").single();
    if(saveError||!saved?.id) return json({error:"The recipe was found but could not be saved privately."},503);
    await admin.from("shared_recipe_templates").update({use_count:Number(sharedHit.use_count||0)+1}).eq("cache_key",sharedKey);
    return json({ok:true,recipePlan:sharedHit.recipe,savedRecipeId:saved.id,cache:"shared",aiCostMicros:0,beta:true});
  }
  const {data:membership}=await admin.from("subscriptions").select("plan_key,status").eq("user_id",user.id).maybeSingle();
  const {data:grant}=await admin.from("complimentary_access_grants").select("status").eq("user_id",user.id).maybeSingle();
  if(grant?.status!=="active"&&(membership?.plan_key!=="core"||!["trialing","active"].includes(membership.status))) return json({error:"An active Meal Daddy Core membership is required."},402);
  const {data:reserved,error:reserveError}=await admin.rpc("reserve_ai_usage",{requested_user_id:user.id,requested_ledger_entry_id:null,requested_kind:"recipe-recreation",requested_reserved_micros:search?100000:30000,requested_monthly_limit_micros:3000000,requested_daily_call_limit:50});
  if(reserveError||!reserved?.[0]?.reservation_id) return json({error:"Recipe AI allowance is unavailable right now."},429);
  const reservationId=reserved[0].reservation_id;
  const release=()=>admin.rpc("release_ai_usage",{requested_reservation_id:reservationId,requested_user_id:user.id});
  const baseTemplate=sharedFresh?sharedHit.recipe:null;
  const system=`You are MealDaddy AI. Create an original at-home recipe inspired by the user's favorite meal; never claim it is a restaurant's proprietary recipe. The ${detail} version must include exact quantities, a department-grouped shopping list, complete instructions, substitutions, estimated per-serving nutrition, and a 0-10 food-impact inflammation estimate. Respect every allergy, restriction, preference, and stated requirement. ${detail==="quick"?"Favor common ingredients, fewer steps, and about 30 minutes when practical.":"Favor a closer restaurant-style result with sauces and technique details."}`;
  const input=`Favorite meal:\n${source}\n\nPrivate personalization requirements:\n${JSON.stringify(personalContext)}\n\nReusable generic starting template, if available:\n${JSON.stringify(baseTemplate)}`;
  const aiBody:any={model,store:false,reasoning:{effort:"minimal"},max_output_tokens:detail==="quick"?2200:3500,input:[{role:"system",content:[{type:"input_text",text:system}]},{role:"user",content:[{type:"input_text",text:input}]}],text:{verbosity:"low",format:recipeFormat}};
  if(search){aiBody.tools=[{type:"web_search"}];aiBody.tool_choice="auto";}
  let response:Response; try{response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify(aiBody)})}catch{await release();return json({error:"Recipe generation could not be reached."},503)}
  if(!response.ok){await release();return json({error:"Recipe generation could not finish."},502)}
  const result=await response.json(); let recipe:any; try{recipe=JSON.parse(outputText(result))}catch{await release();return json({error:"The recipe response was incomplete."},502)}
  const inputTokens=Number(result.usage?.input_tokens||0),outputTokens=Number(result.usage?.output_tokens||0),searchCalls=(result.output||[]).filter((x:any)=>x.type==="web_search_call").length,cost=inputTokens+outputTokens*6+searchCalls*10000;
  const {error:settleError}=await admin.rpc("settle_ai_usage",{requested_reservation_id:reservationId,requested_user_id:user.id,requested_provider:"openai",requested_model:model,requested_input_tokens:inputTokens,requested_output_tokens:outputTokens,requested_actual_cost_micros:cost});
  if(settleError)return json({error:"Recipe generated, but accounting needs attention."},503);
  if(!hasSensitive){await admin.from("shared_recipe_templates").upsert({cache_key:sharedKey,source_description:String(recipe.title||"Generic favorite meal").slice(0,500),detail_level:detail,recipe,source_checked_on:search?new Date().toISOString().slice(0,10):null,expires_at:search?new Date(Date.now()+30*86400000).toISOString():null,updated_at:new Date().toISOString()});}
  const {data:saved,error:saveError}=await admin.from("saved_recipes").upsert({user_id:user.id,request_key:requestKey,source_description:source,detail_level:detail,recipe,shared_template_key:hasSensitive?null:sharedKey,last_used_at:new Date().toISOString()},{onConflict:"user_id,request_key"}).select("id").single();
  if(saveError||!saved?.id)return json({error:"Recipe generated but could not be saved privately."},503);
  return json({ok:true,recipePlan:recipe,savedRecipeId:saved.id,cache:"generated",aiCostMicros:cost,beta:true});
});
