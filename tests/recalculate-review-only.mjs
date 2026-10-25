import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {needsFavoriteRecalculation,hasManualNutritionChanges} from '../app/saved-foods.js';
const source=readFileSync('app/saved-foods.js','utf8');
const start=source.indexOf('  $("#saved-food-review-form").addEventListener("submit"');
const end=source.indexOf('\n  $("#saved-foods-list").addEventListener("submit"',start);
for(const mode of ['sync_cache','device_only','one_time']) for(const existing of [false,true]) {
 const original={name:'Test meal',serving_description:'one plate',item_type:'home_meal',calories:850,evidence_type:'photo_estimate',components:[]};
 let draft={...original}; let handler; let calls=0; let writes=0; let closed=0;
 const elements=new Map(); const el=id=>{if(!elements.has(id))elements.set(id,{checked:false,disabled:false,textContent:'',addEventListener:(type,fn)=>handler=fn});return elements.get(id);};
 const state={editingFood:existing?{...original,id:'test',storage_scope:mode==='device_only'?'device':'sync'}:null,reviewBaseline:original};
 const context={console,state,$:el,reviewFormFood:()=>({...draft}),needsFavoriteRecalculation,hasManualNutritionChanges,numericFields:['calories'],selectedStorageMode:()=>mode,hasCurrentCoreMembership:()=>true,
 invokeAuthenticated:async()=>{calls++;return {data:{food:{...draft,calories:720,evidence_type:'description_estimate',confidence:'low',components:[{name:'test',calories:720}]}}}},
 normalizedFood:f=>f,nutritionChangeSummary:()=>'',setReviewField:(k,v)=>draft[k]=v,evidenceLabels:{description_estimate:'Description estimate'},
 saveReviewedFood:async()=>{writes++;return{}},logFood:async()=>writes++,setStorageMode:()=>{},closeEditor:()=>closed++,defaultMealLabel:()=> 'Dinner',loadFoods:async()=>{},onLedgerChange:async()=>{},toast:()=>{},syncFavoriteEntries:async()=>0,
 document:{querySelector:()=>({value:'future'})},manualFavoriteNutrition:()=>{throw Error('AI preview incorrectly classified as manual')},requestPersistentDeviceStorage:async()=>({persistent:true})};
 vm.runInNewContext(source.slice(start,end),context);
 await handler({preventDefault(){},submitter:{id:'recalculate-saved-food'}});
 assert.equal(writes,0,`${mode} preview must not persist`);assert.equal(closed,0);assert.equal(draft.calories,720);assert.equal(state.editingFood?.calories,existing?850:undefined);
 // A subsequent explicit Save uses the reviewed estimate without another AI call.
 await handler({preventDefault(){},submitter:{id:'save-saved-food'}});
 assert.equal(calls,1);assert.equal(writes,1);assert.equal(closed,1);
}
console.log('PASS: recalculation previews only for new/existing foods in every storage mode; explicit Save persists reviewed values.');
