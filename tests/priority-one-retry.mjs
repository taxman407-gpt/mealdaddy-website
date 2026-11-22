// Exercise the real assembled beta retry/provider functions with synthetic in-memory entries.
// No network, customer accounts, credentials or database calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {aiSetupError,isAiSetupError} from '../app/priority-one-ui.mjs';
execFileSync(process.execPath,['scripts/build-netlify.mjs'],{stdio:'pipe'});
execFileSync(process.execPath,['scripts/build-recipe-workflow-beta.mjs'],{stdio:'pipe'});
const app=readFileSync('dist-beta/app/app.js','utf8');
const client=readFileSync('dist-beta/app/supabase-client.js','utf8');
function section(text,start,end){const i=text.indexOf(start),j=text.indexOf(end,i+start.length);assert(i>=0&&j>i,`Changed integration boundary: ${start}`);return text.slice(i,j);}
const functions=[
 section(app,'async function checkPriorityOneConnection()', 'const pantryReview ='),
 section(app,'async function readFunctionFailure(', 'function showEstimateMembershipPrompt('),
 section(app,'function rememberEstimateFailure(', 'async function handleEstimateFailure('),
 section(app,'async function handleEstimateFailure(', 'async function invokeMemberAi('),
 section(app,'async function invokeMemberAi(', 'async function restoreByokSettings('),
 section(app,'async function retryEstimateEntry(', 'async function addMealImpactDetails(')
].join('\n');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
let source='',credentials=null,cloud=false,providerError=null,hold=null,network=[],reloads=0,renders=0,notices=[];
const entry={id:'synthetic-existing-entry',kind:'meal',status:'pending_estimate'};
const state={membershipPlan:'core',membershipAccess:'beta',estimateFailures:new Map(),estimatingEntryIds:new Set()};
const ctx=vm.createContext({Response,Error,aiSetupError,isAiSetupError,state,user:{id:'synthetic'},
 betaSource:()=>source,betaFunding:()=>source&&source!=='personal'?{provider:'openai',funding:'hosted'}:null,
 localStorage:{getItem:()=>cloud?'cloud':null},byokVault:{read:async()=>credentials},
 priorityOneUi:{show:error=>notices.push(error.message)},toast:text=>notices.push(text),
 renderLedger:()=>renders++,entryById:id=>id===entry.id?entry:null,
 $:()=>({hidden:false}),loadLedger:async()=>{reloads++;entry.status='estimated';},
 showLabelSavePrompt:()=>{},showEstimateMembershipPrompt:()=>{},
 invokeAuthenticated:async(name,opts)=>{network.push({name,opts});if(hold)await hold;return{data:providerError?null:{ok:true},error:providerError};}
});
vm.runInContext(functions,ctx);
eq(await ctx.retryEstimateEntry(entry.id),false);
eq(network.length,0);eq(reloads,0);eq(entry.status,'pending_estimate');eq(state.estimatingEntryIds.size,0);
eq(state.estimateFailures.get(entry.id).includes('Open AI Settings'),true);eq(notices.some(x=>x.includes('could not finish')),false);
source='hosted_openai';eq(await ctx.retryEstimateEntry(entry.id),true);
eq(network.length,1);eq(network[0].name,'estimate-entry');eq(JSON.stringify(network[0].opts.body),JSON.stringify({entryId:entry.id}));eq(reloads,1);eq(entry.status,'estimated');eq(state.estimateFailures.size,0);
eq(await ctx.retryEstimateEntry(entry.id),false);eq(network.length,1); // no retry for completed entry
entry.status='pending_estimate';source='personal';credentials=null;
eq(await ctx.retryEstimateEntry(entry.id),false);eq(network.length,1);eq(state.estimateFailures.get(entry.id).includes('BYOK'),true);
credentials={provider:'openai',model:'synthetic-model',key:'fake-fixture-not-a-key'};
eq(await ctx.retryEstimateEntry(entry.id),true);eq(network[1].opts.body.byok,credentials);eq(network[1].name,'estimate-entry');
entry.status='pending_estimate';credentials=null;cloud=true;
eq(await ctx.retryEstimateEntry(entry.id),true);eq(network[2].opts.body.byok.storage,'cloud');
cloud=false;source='hosted_openai';entry.status='pending_estimate';
providerError=Object.assign(Error('Selected beta connection is not configured.'),{status:503});
eq(await ctx.retryEstimateEntry(entry.id),false);eq(state.estimateFailures.get(entry.id),'Selected beta connection is not configured.');eq(state.estimatingEntryIds.size,0);eq(entry.status,'pending_estimate');
providerError=null;let release;hold=new Promise(resolve=>release=resolve);const first=ctx.retryEstimateEntry(entry.id);await new Promise(resolve=>setTimeout(resolve,0));
const started=network.length;eq(await ctx.retryEstimateEntry(entry.id),false);eq(network.length,started);release();eq(await first,true);hold=null;
eq(notices.some(x=>x.includes('included in today')),true);eq(renders>0,true);
// Verify HTTP setup/funding errors survive the actual beta client's safe-message conversion.
let clientCalls=0;
const apiCtx=vm.createContext({Response,Error,betaFunding:()=>({provider:'openai',funding:'hosted'}),
 supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'synthetic'},access_token:'fake-session'}},error:null})},functions:{invoke:async(name)=>{clientCalls++;assert.equal(name,'beta-pantry-review');return{data:null,error:{context:new Response(JSON.stringify({error:'Setup needed',code:'AI_SETUP_REQUIRED'}),{status:422})}}}}}
});
vm.runInContext(client.slice(client.indexOf('async function invokeAuthenticatedRequest(')),apiCtx);
const failed=await apiCtx.invokeAuthenticatedRequest('pantry-review',{body:{action:'interpret',description:'Eggs'}});
eq(clientCalls,1);eq(failed.error.status,422);eq(failed.error.code,'AI_SETUP_REQUIRED');eq(isAiSetupError(failed.error),true);eq((await failed.error.context.clone().json()).error,'Setup needed');
eq((app.match(/remove\(\[photoPath\]\)/g)||[]).length,2);eq((app.match(/catch \{ console.warn\("Temporary (?:coach|after-meal) photo cleanup failed."\); \}/g)||[]).length,2);
console.log(`PASS: ${checks} assembled beta retry/integration checks (same entry, no duplicates/fallback, setup/status preservation, cleanup repair).`);
