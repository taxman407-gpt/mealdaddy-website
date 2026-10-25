import {PRIVATE_BETA_DEPLOYMENT} from './beta-deployment.mjs';
// Standard API list prices, USD per million tokens, verified 2026-10-25.
// https://developers.openai.com/api/docs/models/gpt-5.6-luna
// https://developers.openai.com/api/docs/models/gpt-5-mini
// https://developers.openai.com/api/docs/pricing
const rates={'gpt-5.6-luna':[.20,.02,1.20],'gpt-5-mini':[.25,.025,2]};
export function processingUsage(request,response,provider){
 const usage=response?.usage,input=Number(usage?.input_tokens),output=Number(usage?.output_tokens);
 const cached=Number(usage?.input_tokens_details?.cached_tokens||0),searches=(response?.output||[]).filter(x=>x.type==='web_search_call').length;
 const rate=provider==='openai'?rates[request.model]:null;
 const known=rate&&Number.isFinite(input)&&Number.isFinite(output)&&input>=cached&&cached>=0&&output>=0&&!usage?.input_tokens_details?.cache_creation_tokens&&(!response.service_tier||['default','standard','auto'].includes(response.service_tier));
 const multiplier=request.model==='gpt-5.6-luna'&&input>272000?2:1;
 return {input_tokens:Number.isFinite(input)?input:null,output_tokens:Number.isFinite(output)?output:null,search_calls:searches,
 estimated_cost_micros:known?Math.round((input-cached)*rate[0]*multiplier+cached*rate[1]*multiplier+output*rate[2]*(multiplier===2?1.5:1)+searches*10000):null,
 rate_version:known?'openai-standard-2026-10-25':null};
}
export async function trackedAiCall({admin,userId,reservationId,entryId=null,category,provider,funding='hosted',request,call}){
 const id=crypto.randomUUID(),photos=(request.input||[]).flatMap(x=>Array.isArray(x.content)?x.content:[]).filter(x=>x.type==='input_image').length;
 const record={id,user_id:userId,reservation_id:reservationId,ledger_entry_id:entryId,environment:PRIVATE_BETA_DEPLOYMENT?'beta':'production',category:photos?'photo_analysis':category,operation:category,provider,model:request.model,funding,photos_submitted:photos,status:'pending'};
 // Persist before dispatch: a crash or timeout remains visible as unresolved, never silently zero-cost.
 const {error}=await admin.from('ai_processing_calls').insert(record);
 if(error)throw new Error('AI usage tracking is unavailable. Please retry; no provider request was made.');
 const finish=async patch=>{try{const result=await admin.from('ai_processing_calls').update(patch).eq('id',id);if(result.error)console.error('AI_METRICS_UPDATE_FAILED',id);}catch{console.error('AI_METRICS_UPDATE_FAILED',id);}};
 let response;
 try{response=await call(request);}catch(error){await finish({status:'unknown'});throw error;}
 let data;try{data=await response.clone().json();}catch{}
 await finish({status:response.ok?'processed':'rejected',...processingUsage(request,data,provider),photos_processed:response.ok?photos:0,http_status:response.status});
 return response;
}
