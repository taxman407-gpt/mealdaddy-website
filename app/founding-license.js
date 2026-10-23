import { supabase } from './supabase-client.js?v=20261004-1';
import { foundingOfferState } from './founding-policy.mjs';
const card=document.querySelector('#founding-offer');
const counter=document.querySelector('#founding-remaining');
const countdown=document.querySelector('#founding-countdown');
const bar=document.querySelector('#founding-availability-bar');
let checking=false;
async function refreshFoundingOffer(){
 if(!card||!counter||checking||document.hidden)return;
 checking=true;
 try {
  const {data,error}=await supabase.functions.invoke('founding-availability',{body:{}});
  const state=foundingOfferState(error?null:data);
  card.hidden=!state.visible;
  counter.textContent=state.counter;
  counter.hidden=!state.counter;
  if(countdown)countdown.hidden=!state.counter;
  if(bar&&state.counter){
   bar.style.setProperty('--sold-percent',`${(2000-data.remaining)/2000*100}%`);
   bar.setAttribute('aria-valuenow',String(data.remaining));
   bar.setAttribute('aria-valuetext',`${data.remaining.toLocaleString('en-US')} of 2,000 licenses available`);
  }
 } catch { card.hidden=true; counter.hidden=true; if(countdown)countdown.hidden=true; }
 finally { checking=false; }
}
void refreshFoundingOffer();
supabase.auth.onAuthStateChange(()=>setTimeout(refreshFoundingOffer,0));
window.addEventListener('focus',refreshFoundingOffer);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshFoundingOffer();});
setInterval(refreshFoundingOffer,60000);
