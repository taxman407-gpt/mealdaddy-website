import {supabase,invokeAuthenticated} from './supabase-client.js?v=20261004-1';
import {betaSource,saveBetaSource} from './beta-connection.js';
const banner=document.createElement('aside');banner.className='beta-banner';
banner.textContent='PRIVATE BETA — Invited accounts only. Your real MealDaddy records stay with your account. No card or paid enrollment is required.';
document.body.prepend(banner);document.title=`BETA — ${document.title}`;
if('serviceWorker' in navigator)for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();
for(const control of document.querySelectorAll('[data-plan]')){control.disabled=true;control.title='Complimentary private beta: no checkout or payment required.';}
const {data:{session}}=await supabase.auth.getSession();
if(session && document.querySelector('#quick-entry')){
 const section=document.createElement('section');section.className='beta-panel beta-connection-panel';section.setAttribute('aria-labelledby','beta-connection-title');
 section.innerHTML='<h2 id="beta-connection-title">Beta AI connection</h2><p>OpenAI uses your existing MealDaddy allowance. Steve covers sponsored Claude or Gemini usage. Personal BYOK is a separate choice and your provider may charge you. Switching never happens automatically.</p><label for="beta-source">Use for AI requests</label><select id="beta-source"><option value="">Choose a connection</option><option value="hosted_openai">OpenAI — existing MealDaddy allowance</option><option value="sponsor_anthropic">Claude — paid by MealDaddy</option><option value="sponsor_gemini">Gemini — paid by MealDaddy</option><option value="personal">My own API key — my provider bills me</option></select><p id="beta-connection-status" role="status"></p>';
 document.querySelector('#provider-settings')?.before(section);
 for(const id of ['plan-options','trial-note']){const element=document.getElementById(id);if(element){element.hidden=false;new MutationObserver(()=>{if(element.hidden)element.hidden=false;}).observe(element,{attributes:true,attributeFilter:['hidden']});}}
 const select=section.querySelector('select'),status=section.querySelector('[role="status"]');select.value=betaSource(session.user.id)||'';
 const {data,error}=await invokeAuthenticated('beta-access',{body:{action:'status'}});
 function showStatus(){const own=select.value==='personal';document.querySelector('#provider-settings').hidden=!own;status.textContent=error?error.message:select.value==='hosted_openai'?(data?.providers?.openai?'OpenAI selected. Your existing MealDaddy membership and AI cost limits apply.':'OpenAI is not configured. No other provider will be used.'):own?'Use the provider settings below to connect your personal key.':select.value?(data?.providers?.[select.value==='sponsor_anthropic'?'anthropic':'gemini']?'Selected. Usage remains subject to the sponsor allowance.':'Selected provider is waiting for its sponsor API credentials. Your meals can still be saved.'):'Choose a connection before requesting AI analysis.';}
 select.addEventListener('change',()=>{try{saveBetaSource(session.user.id,select.value);showStatus();}catch(error){status.textContent=error.message;}});showStatus();
 // Membership loading may change visibility after this module has mounted.
 new MutationObserver(()=>{const panel=document.querySelector('#provider-settings');const expected=select.value!=='personal';if(panel.hidden!==expected)panel.hidden=expected;}).observe(document.querySelector('#provider-settings'),{attributes:true,attributeFilter:['hidden']});
}
