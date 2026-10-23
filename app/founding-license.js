import { invokeAuthenticated, supabase } from './supabase-client.js?v=20261004-1';
import { foundingOfferState } from './founding-policy.mjs';
const card=document.querySelector('#founding-offer');
const counter=document.querySelector('#founding-remaining');
let checking=false;
async function refreshFoundingOffer(){
 if(!card||!counter||checking||document.hidden)return;
 checking=true;
 try {
  const {data,error}=await invokeAuthenticated('founding-availability',{body:{}});
  const state=foundingOfferState(error?null:data);
  card.hidden=!state.visible;
  counter.textContent=state.counter;
  counter.hidden=!state.counter;
 } catch { card.hidden=true; counter.hidden=true; }
 finally { checking=false; }
}
void refreshFoundingOffer();
supabase.auth.onAuthStateChange(()=>setTimeout(refreshFoundingOffer,0));
window.addEventListener('focus',refreshFoundingOffer);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshFoundingOffer();});
setInterval(refreshFoundingOffer,60000);
