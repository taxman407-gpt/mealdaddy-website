/** Validated aggregate-only state, separately scoped to each Founding plan. */
export function foundingOfferState(value, {standard=false}={}) {
 const invalid={visible:false,counter:''};
 if(value?.capacity!==2000 || typeof value.soldOut!=='boolean' || !Number.isSafeInteger(value.remaining)||value.remaining<0||value.remaining>2000) return invalid;
 if(value.soldOut) return {visible:true,counter:'',regular:true};
 return {visible:true,counter:`${value.remaining.toLocaleString('en-US')} Available`};
}
