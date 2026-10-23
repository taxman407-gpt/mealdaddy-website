/** Aggregate-only availability; never infer a purchase count from page views. */
export function foundingOfferState(value) {
 if(value?.capacity!==2000 || typeof value.soldOut!=='boolean' || typeof value.counterVisible!=='boolean') return {visible:false,counter:''};
 if(value.soldOut) return {visible:false,counter:''};
 if(!value.counterVisible) return {visible:true,counter:''};
 if(!Number.isSafeInteger(value.remaining)||value.remaining<0||value.remaining>2000) return {visible:false,counter:''};
 return {visible:true,counter:`${value.remaining.toLocaleString('en-US')} Available`};
}
