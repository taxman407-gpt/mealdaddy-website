import {PRIVATE_BETA_DEPLOYMENT} from "./beta-deployment.mjs";
import {validateByok,callByokProvider} from './byok-provider.mjs';
const variables={anthropic:{key:'BETA_ANTHROPIC_API_KEY',model:'BETA_ANTHROPIC_MODEL'},gemini:{key:'BETA_GEMINI_API_KEY',model:'BETA_GEMINI_MODEL'}};
const failure=(message,status=503)=>Object.assign(new Error(message),{status});
/** Called after bearer-token validation. Credentials never leave this closure. */
export async function createSponsoredBetaConnection({admin,userId,provider,env=name=>Deno.env.get(name),fetchImpl=fetch}){
 if(!PRIVATE_BETA_DEPLOYMENT && env('ENABLE_SPONSORED_BETA')!=='true')throw failure('Sponsor-paid beta AI is not enabled.');
 const names=variables[provider];
 if(!names)throw failure('Select Claude or Gemini for sponsor-paid beta use.',422);
 let credentials;
 try{credentials=validateByok({provider,key:env(names.key),model:env(names.model)});}
 catch{throw failure('This sponsor-paid provider is not configured. No personal key was used.');}
 return Object.freeze({provider,model:credentials.model,billing:'beta_sponsor',
  async call(request){
   if(request.tools?.length)throw failure('Web search is not supported by this selected connection. No alternate provider was used.',422);
   if(!Array.isArray(request.input)||!Number.isSafeInteger(request.max_output_tokens)||request.max_output_tokens<1||request.max_output_tokens>4096)throw failure('Invalid beta request limits.',422);
   // Reservation is atomic, checks the live invitation, and applies both global and per-tester quotas.
   const {data,error}=await admin.rpc('reserve_beta_sponsored_request',{requested_user_id:userId,requested_provider:provider});
   if(error||data!==true)throw failure('Beta access or the sponsor-paid usage allowance is unavailable.',429);
   try{return await callByokProvider(credentials,request,fetchImpl);}
   catch{throw failure('The selected beta provider request failed. No alternate provider or personal key was used.',502);}
  }
 });
}
