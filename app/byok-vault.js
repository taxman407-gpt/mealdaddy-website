// Provider credentials are kept on this device. Nothing here writes to Supabase.
const sessions = new Map();
let database;
function localDatabase() {
  if (!globalThis.indexedDB) throw new Error('Device key storage is unavailable in this browser.');
  return database ||= new Promise((resolve,reject)=>{
    const request=indexedDB.open('mealdaddy-byok-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('credentials');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{database=null;reject(new Error('Device key storage is unavailable.'));};
  });
}
const deviceStore={
  async run(action,key,value){
    const db=await localDatabase();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('credentials',action==='get'?'readonly':'readwrite');
      const store=tx.objectStore('credentials');
      const request=action==='get'?store.get(key):action==='delete'?store.delete(key):store.put(value,key);
      let result;request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new Error('Device key storage failed.'));tx.onabort=()=>reject(new Error('Device key storage failed.'));
    });
  }
};
export function createByokVault(userId,{store=deviceStore,crypto=globalThis.crypto}={}){
  if(!userId)throw new Error('A signed-in account is required.');
  const aad=new TextEncoder().encode(userId);
  return {
    async save(value,{remember=true}={}){
      if(!['openai','anthropic','gemini'].includes(value.provider)||!value.model?.trim()||!value.key?.trim())throw new Error('Choose a provider and enter its model ID and API key.');
      const credentials={provider:value.provider,model:value.model.trim(),key:value.key.trim()};
      if(!remember){await store.run('delete',userId);sessions.set(userId,credentials);return;}
      const wrappingKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      const nonce=crypto.getRandomValues(new Uint8Array(12));
      const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad},wrappingKey,new TextEncoder().encode(JSON.stringify(credentials)));
      await store.run('put',userId,{wrappingKey,nonce,encrypted});
      sessions.delete(userId);
    },
    async read(){
      if(sessions.has(userId))return {...sessions.get(userId)};
      const saved=await store.run('get',userId);
      if(!saved)return null;
      try {
        const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.nonce,additionalData:aad},saved.wrappingKey,saved.encrypted);
        return JSON.parse(new TextDecoder().decode(plain));
      }catch{throw new Error('The saved device key could not be opened. Remove it and reconnect the provider.');}
    },
    async remove(){sessions.delete(userId);await store.run('delete',userId);}
  };
}
