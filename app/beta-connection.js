// Included only in the private-beta build. No credentials are stored here.
const sources=new Set(['hosted_openai','sponsor_anthropic','sponsor_gemini','personal']);
export function betaSource(userId){try{const value=localStorage.getItem(`mealdaddy-beta-source:${userId}`);return sources.has(value)?value:null;}catch{return null;}}
export function saveBetaSource(userId,value){if(!sources.has(value))throw new Error('Choose a beta AI connection.');localStorage.setItem(`mealdaddy-beta-source:${userId}`,value);}
export function betaFunding(userId){
 const source=betaSource(userId);
 if(!source)throw new Error('Choose your beta AI connection under More → Beta AI connection first.');
 if(source==='hosted_openai')return {storage:'beta_hosted',provider:'openai'};
 return source==='personal'?null:{storage:'beta_sponsor',provider:source==='sponsor_anthropic'?'anthropic':'gemini'};
}
