import {supabase,requireSession} from './supabase-client.js?v=20261004-1';
const session=await requireSession();
if(!session)throw Error('Sign in required');
const form=document.querySelector('#adult-form'),status=document.querySelector('#adult-status');
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!document.querySelector('#adult-confirm').checked)return;
 const button=form.querySelector('button');button.disabled=true;
 try{
  const {error}=await supabase.from('adult_eligibility').insert({user_id:session.user.id,confirmed_adult:true,policy_version:1});
  // A repeated confirmation is safe only after re-reading the existing record.
  if(error){const check=await supabase.from('adult_eligibility').select('confirmed_adult,policy_version').eq('user_id',session.user.id).maybeSingle();if(check.error||check.data?.confirmed_adult!==true||check.data.policy_version!==1)throw error;}
  location.replace('./app.html');
 }catch{status.textContent='Your confirmation could not be saved. Please retry. Account management remains available below.';button.disabled=false;}
});
