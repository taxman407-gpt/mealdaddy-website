import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('app/auth.js','utf8').replace(/^import .*;\n/gm,'');
async function scenario(hasMfa) {
  const nodes=new Map();
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:'',hidden:false,dataset:{},classList:{toggle(){}},handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},closest(){return node('label');},replaceChildren(){},focus(){},select(){},setAttribute(){}});
    return nodes.get(selector);
  };
  let authEvent, level='aal1', updates=0, redirects=0, rejectCode=true;
  const supabase={auth:{onAuthStateChange(fn){authEvent=fn;},getSession:async()=>({data:{session:null}}),signOut:async()=>({}),updateUser:async()=>{assert.ok(!hasMfa||level==='aal2');updates++;return {};},mfa:{
    listFactors:async()=>({data:{all:hasMfa?[{id:'factor',factor_type:'totp',status:'verified'}]:[]}}),
    getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level}}),
    challengeAndVerify:async()=>{if(rejectCode)return {error:new Error('Invalid code')};level='aal2';return {};}
  }}};
  const run=new Function('document','supabase','location','pendingReferral',`return (async()=>{${source}})()`);
  await run({querySelector:node,querySelectorAll:()=>[],createElement:()=>({})},supabase,{href:'https://test.example/app/auth.html',search:'',replace(){redirects++;}},()=>null);
  authEvent('PASSWORD_RECOVERY');
  const submit=()=>node('#auth-form').handlers.submit({preventDefault(){}});
  node('#password').value=node('#confirm-password').value='synthetic-password';
  await submit();
  if(hasMfa){
    assert.equal(updates,0);assert.equal(node('#auth-form').hidden,true);assert.equal(node('#mfa-signin-form').hidden,false);
    assert.equal(node('#password').value,'');
    node('#mfa-signin-code').value='123456';
    await node('#mfa-signin-form').handlers.submit({preventDefault(){}});
    assert.equal(updates,0);assert.equal(redirects,0);
    rejectCode=false;
    await node('#mfa-signin-form').handlers.submit({preventDefault(){}});
    assert.equal(redirects,0);assert.equal(node('#auth-form').hidden,false);assert.equal(node('#mfa-signin-form').hidden,true);
    node('#password').value=node('#confirm-password').value='synthetic-password';
    await submit();
  }
  assert.equal(updates,1);assert.equal(redirects,1);
}
await scenario(true);
await scenario(false);
console.log('Recovery runtime: MFA before password update, invalid-code retry, return to password form and no-MFA recovery passed.');
