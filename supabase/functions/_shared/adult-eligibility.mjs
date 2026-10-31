// Use only after token validation. Never trust editable JWT user_metadata for this gate.
export async function requireAdultEligibility(admin, userId) {
  try {
    const {data,error}=await admin.from('adult_eligibility').select('confirmed_adult,policy_version').eq('user_id',userId).maybeSingle();
    if(error)return {ok:false,status:503,error:'Age eligibility could not be checked. Please try again.'};
    if(data?.confirmed_adult!==true||data.policy_version!==1)return {ok:false,status:403,error:'MealDaddy is for adults 18 and older. Confirm your eligibility before continuing.'};
    return {ok:true};
  }catch{return {ok:false,status:503,error:'Age eligibility could not be checked. Please try again.'};}
}
