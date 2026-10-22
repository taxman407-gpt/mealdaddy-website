export function welcomePayload({recipient,from,signInUrl}){
 const url=new URL(signInUrl);
 if(url.protocol!=='https:'||!['www.mealdaddy.ai','mealdaddy.ai','mealdaddy-october-test.taxman407.workers.dev'].includes(url.hostname)||url.pathname!=='/app/auth.html'||url.search||url.hash||url.username||url.password)throw new Error('WELCOME_URL_INVALID');
 if(typeof recipient!=='string'||!/^\S+@\S+\.\S+$/.test(recipient)||/[\r\n]/.test(recipient)||typeof from!=='string'||/[\r\n]/.test(from)||!from.includes('@'))throw new Error('WELCOME_ADDRESS_INVALID');
 return {from,to:[recipient],subject:"Welcome to MealDaddy™ — Let's Get Started!",text:`Welcome to MealDaddy! We're glad you're here.\n\nComplete your profile, log your first meal (description or photo), explore your nutrition and hydration dashboard, and save favorite foods.\n\nSign in: ${url.href}\n\nMealDaddy Team.\nGeneral wellness guidance; not medical advice.`};
}
export function welcomeRetry({attempts,firstAttemptAt,now=Date.now(),permanent=false}){
 if(permanent)return {status:'failed',nextAttemptAt:null};
 if(attempts>=6||now-Date.parse(firstAttemptAt)>=23*3600000)return {status:'review_required',nextAttemptAt:null};
 return {status:'pending',nextAttemptAt:new Date(now+Math.min(3600000,60000*2**Math.max(0,attempts-1))).toISOString()};
}
export async function sendWelcome({delivery,key,fetchImpl=fetch}){
 if(!key||!delivery.payload||!delivery.user_id)throw new Error('WELCOME_NOT_CONFIGURED');
 const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json','Idempotency-Key':`mealdaddy-welcome/${delivery.user_id}`},body:JSON.stringify(delivery.payload),signal:AbortSignal.timeout(20000)});
 if(!response.ok){const error=new Error('WELCOME_PROVIDER_REJECTED');error.permanent=[400,401,403,404,422].includes(response.status);error.code=`PROVIDER_${response.status}`;throw error;}
 const data=await response.json();if(typeof data.id!=='string'||!data.id)throw new Error('WELCOME_PROVIDER_RESPONSE_INVALID');return {messageId:data.id};
}
