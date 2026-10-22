const codePattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pendingKey='mealdaddy-referral-pending-v1';
export function captureReferral({search=globalThis.location?.search||'',storage=globalThis.localStorage}={}){
 const code=new URLSearchParams(search).get('ref');
 if(!code||!codePattern.test(code))return null;
 try{if(!storage.getItem(pendingKey))storage.setItem(pendingKey,code);return storage.getItem(pendingKey);}catch{return code;}
}
export function pendingReferral(user=null,storage=globalThis.localStorage){
 let code;try{code=storage.getItem(pendingKey);}catch{}
 if(!code)code=user?.user_metadata?.signup_referral_code;
 if(!codePattern.test(String(code||'')))return null;
 try{if(user&&storage.getItem(`mealdaddy-referral-attempt:${user.id}`)===code)return null;}catch{}
 return code;
}
export async function claimPendingReferral({user,invoke,storage=globalThis.localStorage}){
 const code=pendingReferral(user,storage);if(!code||!user?.email_confirmed_at)return false;
 const {data,error}=await invoke('manage-referrals',{body:{action:'attribute',code}});
 if(error||data?.ok!==true)return false;
 try{storage.setItem(`mealdaddy-referral-attempt:${user.id}`,code);storage.removeItem(pendingKey);}catch{}
 return data.attributed===true;
}
captureReferral();
