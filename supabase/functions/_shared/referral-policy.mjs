import {addUtcYears} from './membership-policy.mjs';
function cents(value){if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid receipt amount.');return value;}
export function eligibleCollectedNet({amountPaidCents,totalCents,totalExcludingTaxCents}){
 const paid=cents(amountPaidCents),total=cents(totalCents),net=cents(totalExcludingTaxCents);
 if(!total||!paid)return 0;
 if(net>total)throw new Error('Receipt net exceeds its total.');
 return Math.floor(Math.min(paid,total)*net/total);
}
export function affiliateCommission({approved,kind,eligibleNetCents,firstPaidAt,paidAt}){
 const net=cents(eligibleNetCents);if(!approved)return 0;
 if(kind==='lifetime')return Math.round(net*0.075);
 if(kind!=='subscription')return 0;
 const paid=Date.parse(paidAt),start=Date.parse(firstPaidAt),end=Date.parse(addUtcYears(firstPaidAt,1));
 if(!Number.isFinite(paid)||paid<start||paid>=end)return 0;
 return Math.round(net*0.15);
}
