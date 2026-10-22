import {validateByok} from './byok-provider.mjs';
function decode(value){return Uint8Array.from(atob(value),char=>char.charCodeAt(0));}
function encode(value){return btoa(String.fromCharCode(...new Uint8Array(value)));}
async function masterKey(secret,cryptoImpl){
 let bytes;try{bytes=decode(String(secret||''));}catch{throw new Error('Cloud key encryption is not configured.');}
 if(bytes.length!==32)throw new Error('Cloud key encryption is not configured.');
 return cryptoImpl.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function sealByokCredentials(userId,value,secret,cryptoImpl=globalThis.crypto){
 if(!userId)throw new Error('An account is required.');
 const credentials=validateByok(value),key=await masterKey(secret,cryptoImpl),nonce=cryptoImpl.getRandomValues(new Uint8Array(12));
 const encrypted=await cryptoImpl.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:new TextEncoder().encode(`mealdaddy-byok-v1:${userId}`)},key,new TextEncoder().encode(JSON.stringify(credentials)));
 return {version:1,provider:credentials.provider,model:credentials.model,nonce:encode(nonce),ciphertext:encode(encrypted)};
}
export async function openByokCredentials(userId,record,secret,cryptoImpl=globalThis.crypto){
 if(!userId||record?.version!==1)throw new Error('The encrypted provider connection is unavailable.');
 try{
  const key=await masterKey(secret,cryptoImpl);
  const plain=await cryptoImpl.subtle.decrypt({name:'AES-GCM',iv:decode(record.nonce),additionalData:new TextEncoder().encode(`mealdaddy-byok-v1:${userId}`)},key,decode(record.ciphertext));
  const value=validateByok(JSON.parse(new TextDecoder().decode(plain)));
  if(value.provider!==record.provider||value.model!==record.model)throw new Error();
  return value;
 }catch{throw new Error('The encrypted account connection could not be opened. Reconnect it; no alternate provider was used.');}
}
