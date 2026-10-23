import { supabase } from './supabase-client.js?v=20261004-1';
import { foundingOfferState } from './founding-policy.mjs';
let checking=false;
function render(card,value,standard=false){
 if(!card)return;
 const state=foundingOfferState(value,{standard});
 card.hidden=!state.visible;
 const counter=card.querySelector(standard?'[data-founding-remaining]':'#founding-remaining');
 const countdown=card.querySelector(standard?'[data-founding-countdown]':'#founding-countdown');
 const bar=card.querySelector(standard?'[data-founding-bar]':'#founding-availability-bar');
 counter.textContent=state.counter;counter.hidden=!state.counter;countdown.hidden=!state.counter;
 {
  card.querySelector('.plan-label').textContent=state.regular?'Lifetime Member License':'Founding Member Lifetime License';
  card.querySelector('.pricing-price strong').textContent=state.regular?(standard?'$395':'$295'):(standard?'$350':'$250');
  card.querySelector('[data-founding-limit]').hidden=!!state.regular;
 }
 if(state.counter){bar.style.setProperty('--sold-percent',`${(2000-value.remaining)/20}%`);bar.setAttribute('aria-valuenow',String(value.remaining));bar.setAttribute('aria-valuetext',`${value.remaining.toLocaleString('en-US')} of 2,000 licenses available`);}
}
async function refreshFoundingOffer(){
 if(checking||document.hidden)return;checking=true;
 try{
  const {data,error}=await supabase.functions.invoke('founding-availability',{body:{}});
  render(document.querySelector('#founding-offer'),error?null:data?.plans?.byo);
  render(document.querySelector('#standard-lifetime-offer'),error?null:data?.plans?.core,true);
 }catch{render(document.querySelector('#founding-offer'),null);render(document.querySelector('#standard-lifetime-offer'),null,true);}
 finally{checking=false;}
}
void refreshFoundingOffer();
supabase.auth.onAuthStateChange(()=>setTimeout(refreshFoundingOffer,0));
window.addEventListener('focus',refreshFoundingOffer);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshFoundingOffer();});
setInterval(refreshFoundingOffer,60000);
