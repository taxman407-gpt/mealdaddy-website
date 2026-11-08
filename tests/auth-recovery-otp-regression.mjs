import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync('app/auth.js', 'utf8').replace(/^import .*;\n/gm, '');
const event = () => ({preventDefault(){}});
async function setup({mfa=false, verifyError=false, verifyThrows=false, session=null, search=''}={}) {
  const nodes=new Map();
  const node=selector=>{
    if(!nodes.has(selector)) nodes.set(selector,{
      value:'',hidden:false,disabled:false,textContent:'',dataset:{},handlers:{},
      classList:{toggle(){}},addEventListener(type,fn){this.handlers[type]=fn;},
      closest(){return node('label');},replaceChildren(){},focus(){},select(){},setAttribute(){}
    });
    return nodes.get(selector);
  };
  const calls={updates:[],verifications:[],resets:[],redirects:[],signouts:[]};
  let callback,level='aal1',resolveReset=null;
  const auth={
    onAuthStateChange(fn){callback=fn;},getSession:async()=>({data:{session}}),
    resetPasswordForEmail:async(address,options)=>{calls.resets.push({address,options});return {};},
    verifyOtp:async(payload)=>{
      calls.verifications.push(payload);
      if(verifyThrows) throw new Error('Temporary connection failure');
      if(verifyError) return {error:new Error('Expired recovery code')};
      callback('PASSWORD_RECOVERY');
      return {data:{session:{user:{id:'test-user'}}},error:null};
    },
    updateUser:async(payload)=>{
      assert.ok(!mfa||level==='aal2','MFA is required before the password update');
      calls.updates.push(payload);return {data:{user:{id:'test-user'}},error:null};
    },
    signOut:async(options)=>{calls.signouts.push(options);return {};},
    mfa:{
      listFactors:async()=>({data:{all:mfa?[{id:'test-factor',factor_type:'totp',status:'verified'}]:[]}}),
      getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level}}),
      challengeAndVerify:async()=>{level='aal2';return {};}
    }
  };
  const location={href:'https://test.example/app/auth.html'+search,search,origin:'https://test.example',hash:'',replace(value){calls.redirects.push(value);}};
  const history={replaceState(){}};
  const run=new Function('document','supabase','location','pendingReferral','history',`return (async()=>{${source}})()`);
  await run({querySelector:node,querySelectorAll:()=>[],createElement:()=>({})},{auth},location,()=>null,history);
  return {node,calls,auth,emit:(name)=>callback(name),
    request:()=>node('#reset-password').handlers.click(event()),
    submit:()=>node('#auth-form').handlers.submit(event()),
    deferReset(){auth.resetPasswordForEmail=async(address,options)=>{calls.resets.push({address,options});return new Promise(resolve=>{resolveReset=resolve;});};},
    releaseReset(){resolveReset({});}
  };
}

for(const mfa of [false,true]) {
  const test=await setup({mfa});
  test.node('#email').value='test@example.invalid';
  await test.request();
  test.node('#recovery-code').value='123456';
  test.node('#password').value=test.node('#confirm-password').value='only-a-synthetic-test-password';
  await test.submit();
  assert.deepEqual(test.calls.verifications,[{email:'test@example.invalid',token:'123456',type:'recovery'}]);
  if(mfa){
    assert.equal(test.calls.updates.length,0);
    assert.equal(test.node('#password').value,'','Password must be cleared before the MFA prompt');
    test.node('#mfa-signin-code').value='123456';
    await test.node('#mfa-signin-form').handlers.submit(event());
    test.node('#password').value=test.node('#confirm-password').value='only-a-synthetic-test-password';
    await test.submit();
  }
  assert.deepEqual(test.calls.updates,[{password:'only-a-synthetic-test-password'}],'Recovery code must preserve the chosen password until the authorized update');
  assert.equal(test.calls.redirects.length,1);
}

for(const failure of [{verifyError:true},{verifyThrows:true}]) {
  const test=await setup(failure);
  test.node('#email').value='test@example.invalid';await test.request();
  test.node('#recovery-code').value='123456';
  test.node('#password').value=test.node('#confirm-password').value='only-a-synthetic-test-password';
  await test.submit();
  assert.equal(test.calls.updates.length,0,'Failed code verification must never update a password');
  assert.equal(test.calls.redirects.length,0);
  assert.equal(test.node('#auth-submit').disabled,false,'The form must recover after a network failure');
}

{
  const test=await setup();test.node('#email').value='test@example.invalid';
  test.deferReset();const first=test.request();await Promise.resolve();
  await test.request();assert.equal(test.calls.resets.length,1,'Double-click must send only one email');
  test.releaseReset();await first;
  await test.request();assert.equal(test.calls.resets.length,1,'Immediate resend must not invalidate a fresh code');
}

{
  const test=await setup({session:{user:{id:'test-user'}},search:'?mode=recovery'});
  assert.equal(test.calls.updates.length,0);
  assert.equal(test.calls.redirects.length,0,'A recovery query parameter is not proof of a recovery session');
  test.node('#password').value=test.node('#confirm-password').value='only-a-synthetic-test-password';
  test.emit('PASSWORD_RECOVERY');
  test.node('#password').value=test.node('#confirm-password').value='only-a-synthetic-test-password';
  test.emit('PASSWORD_RECOVERY');
  assert.equal(test.node('#password').value,'only-a-synthetic-test-password','Repeated recovery events must not clear entered passwords');
}
console.log('Email recovery regression: chosen password preserved, MFA enforced, errors fail closed, duplicate sends blocked, query-only recovery denied.');
