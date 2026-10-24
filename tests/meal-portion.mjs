import assert from 'node:assert/strict';
import { splitMealPortion, mealDescriptionWithPortion } from '../app/meal-portion.js';
assert.deepEqual(splitMealPortion('50% Test pizza'), { description:'Test pizza',percentage:50 });
assert.equal(mealDescriptionWithPortion('Test pizza',50),'50% Test pizza');
assert.equal(mealDescriptionWithPortion('50% Test pizza',50),'50% Test pizza');
assert.equal(mealDescriptionWithPortion('Test pizza',100),'Test pizza');
assert.equal(mealDescriptionWithPortion('Test pizza',0),'0% Test pizza');
assert.equal(mealDescriptionWithPortion('1 oz dressing (one third of a 3 oz cup)',100),'1 oz dressing (one third of a 3 oz cup)');
assert.throws(() => mealDescriptionWithPortion('25% Test pizza',50));
for (const value of ['',-1,1001,NaN,Infinity]) assert.throws(() => mealDescriptionWithPortion('Test pizza',value));
console.log('Direct meal percent: parsing, serialization, no double scaling, conflicts and bounds passed.');

const {scaleSavedMealPortion} = await import('../app/meal-portion.js');
const manual = {calories:144,protein_g:5.7,carbs_g:6.6,net_carbs_g:3.7,fiber_g:2.9,fat_g:11,saturated_fat_g:3.6,sodium_mg:130,added_sugar_g:0,hydration_ounces:2,inflammation_score:3,source:'saved_food',favorite_origin:{id:'fixture',servings:1}};
manual.components=[{...manual,name:'Muffin'}];
const entry={kind:'meal',status:'estimated',description:'Muffin',nutrition_estimate:manual};
const half=scaleSavedMealPortion(entry,'50% Muffin');
for(const field of ['calories','protein_g','carbs_g','net_carbs_g','fiber_g','fat_g','saturated_fat_g','sodium_mg','added_sugar_g','hydration_ounces']) {
 assert.equal(half[field],manual[field]/2,field);
 assert.equal(half.components[0][field],manual[field]/2,field);
}
assert.equal(half.inflammation_score,3);
assert.equal(half.source,'saved_food');
assert.equal(manual.calories,144);
const zero=scaleSavedMealPortion({...entry,description:'50% Muffin',nutrition_estimate:half},'0% Muffin');
assert.equal(zero.calories,0);
const full=scaleSavedMealPortion({...entry,description:'0% Muffin',nutrition_estimate:zero},'Muffin');
assert.equal(full.calories,144);
assert.equal(full.net_carbs_g,3.7);
assert.equal(full.components[0].name,'Muffin');
const quarter=scaleSavedMealPortion({...entry,description:'50% Muffin',nutrition_estimate:half},'25% Muffin');
assert.equal(quarter.calories,36);
assert.equal(quarter.net_carbs_g,.925);
assert.equal(scaleSavedMealPortion(entry,'50% Muffin with butter'),null);
assert.equal(scaleSavedMealPortion({...entry,status:'pending_estimate'},'50% Muffin'),null);
assert.throws(()=>scaleSavedMealPortion({...entry,nutrition_estimate:{...manual,leftover_adjustment:{}}},'50% Muffin'));
assert.throws(()=>scaleSavedMealPortion({...entry,nutrition_estimate:{...manual,photo_review:[{name:'drink'}]}},'50% Muffin'));
console.log('Saved portion edits preserve manual quantities, scale every nutrient, retain composition score and restore from zero without AI or rounding drift.');
