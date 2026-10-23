import {cpSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const out='dist-beta';
rmSync(out,{recursive:true,force:true});cpSync('dist',out,{recursive:true});
const read=file=>readFileSync(`${out}/app/${file}`,'utf8');
const write=(file,text)=>writeFileSync(`${out}/app/${file}`,text);
for(const file of ['beta-controls.js','beta-connection.js','beta-admin.js','beta.css'])cpSync(`app/${file}`,`${out}/app/${file}`);
let client=read('supabase-client.js');
client="import {betaFunding} from './beta-connection.js';\n"+client;
client=client.replace('  // Mount only when the Quick Log form exists.',`  const beta = await invokeAuthenticated('beta-access', {body:{action:'accept'}});
  if (beta.error || !beta.data?.ok) {
    document.body.replaceChildren();
    const panel=document.createElement('main');panel.className='beta-panel';
    const title=document.createElement('h1');title.textContent='Private beta access';
    const message=document.createElement('p');message.textContent=beta.error?.message||'An approved beta invitation is required.';
    const link=document.createElement('a');link.href='./auth.html';link.textContent='Use a different account';link.onclick=async event=>{event.preventDefault();await supabase.auth.signOut({scope:'local'});location.assign('./auth.html');};
    panel.append(title,message,link);document.body.append(panel);return null;
  }
  data.session.betaPlan=beta.data.plan;
  // Mount only when the Quick Log form exists.`);
client=client.replace('  const invokeWithToken =',`  const aiNames=new Set(['estimate-entry','coach-action','analyze-saved-food','adjust-leftovers','recipe-recreation']);
  const allowed=new Set([...aiNames,'beta-access','owner-access-status','manage-family-access','summarize-feedback','manage-referrals','manage-byok','owner-conversion-report']);
  if(!allowed.has(functionName))return {data:null,error:new Error('Payments and account deletion are disabled during the private beta. No charge was made.')};
  if(aiNames.has(functionName)){
    try{
      const funding=betaFunding(session.user.id);
      if(funding)options={...options,body:{...options.body,byok:funding}};
    }catch(error){return {data:null,error};}
  }
  functionName=functionName==='beta-access'?functionName:'beta-'+functionName;
  const invokeWithToken =`);
write('supabase-client.js',client);
let app=read('app.js');
app="import {betaFunding} from './beta-connection.js';\n"+app;
app=app.replace('  if (state.membershipPlan !== "byo") return invokeAuthenticated(functionName, options);',`  try { if(betaFunding(user.id)) return invokeAuthenticated(functionName,options); }
  catch(error){return {data:null,error};}
  if (state.membershipPlan !== "byo") return invokeAuthenticated(functionName, options);`);
app=app.replace('async function loadMembership() {',`async function loadMembership() {
  if(session.betaPlan){
    state.membershipPlan=session.betaPlan;state.membershipStatus='active';state.membershipAccess='beta';
    $('#estimate-membership-prompt').hidden=true;$('#subscription').hidden=false;$('#plan-options').hidden=false;$('#trial-note').hidden=false;
    $('#subscription-title').textContent='Complimentary Private Beta';
    $('#subscription-copy').textContent='Your invited access is free. No card or paid subscription is required. Plans below are for review only.';
    $('#billing-status').textContent='Complimentary beta access active';return;
  }`);
write('app.js',app);
write('auth.html',read('auth.html').replace('Sign in to open your daily ledger, profile, and plans.','Use your regular MealDaddy login. New testers must use the email Steve approved.').replace('Creating an account does not require payment information. Stripe is used only if you later choose a paid membership.','Private beta access is complimentary. No payment information is required; checkout is disabled.').replace('href="../"','href="https://www.mealdaddy.ai/"'));

// No synthetic inventory in the real beta, and no calls to production billing endpoints.
write('founding-license.js',read('founding-license.js').replace("supabase.functions.invoke('founding-availability'", "supabase.functions.invoke('beta-founding-availability'"));
write('register-sw.js','// Service workers are disabled for the private beta.\n');
write('service-worker.js',"self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));\n");
function prepare(directory){for(const item of readdirSync(directory,{withFileTypes:true})){
 const path=join(directory,item.name);if(item.isDirectory()){prepare(path);continue;}
 if(!/\.(html|js|mjs|json)$/.test(path))continue;
 let text=readFileSync(path,'utf8');
 if(item.name.endsWith('.html'))text=text.replace('</head>','<link rel="stylesheet" href="/app/beta.css"><script type="module" src="/app/beta-controls.js"></script></head>');
 if(text.includes('sb_secret_')||text.includes('dkirmzthyynogkkaacmj'))throw new Error(`Unexpected credential or sample endpoint in ${path}`);
 writeFileSync(path,text);
}}
prepare(out);
// Retain the separate browser-only sample lab; its fictional records never reach the shared database.
for(const file of ['test-lab.html','test-lab.js','test-lab.css'])cpSync(`app/${file}`,`${out}/app/${file}`);
const fixtures=readFileSync('supabase/test-functions/estimate-entry/fixtures.mjs','utf8').replace('../../functions/_shared/estimate-edit-contract.mjs','./test-estimate-contract.mjs').replace('../../functions/_shared/nutrition-reconciliation.mjs','./test-nutrition-reconciliation.mjs');
write('test-fixtures.mjs',fixtures);
cpSync('supabase/functions/_shared/estimate-edit-contract.mjs',`${out}/app/test-estimate-contract.mjs`);
cpSync('supabase/functions/_shared/nutrition-reconciliation.mjs',`${out}/app/test-nutrition-reconciliation.mjs`);
let owner=read('feedback-insights.html');owner=owner.replace('</main>','<div id="beta-admin-root"></div></main>').replace('</body>','<script type="module" src="./beta-admin.js"></script></body>');write('feedback-insights.html',owner);
writeFileSync(`${out}/beta-build.json`,JSON.stringify({environment:'private-beta',accounts:'shared',billing:'disabled',apiNamespace:'beta-',credentials:'server-only'}));
console.log('Prepared private beta: shared accounts, invitation gate, beta API namespace, no checkout or sample inventory.');
