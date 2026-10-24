import assert from 'node:assert/strict';
import {needsFavoriteRecalculation,manualFavoriteNutrition} from '../app/saved-foods.js';
const old={item_type:'home_meal',name:'Muffin',serving_description:'one muffin',notes:'Recipe makes 6 muffins',calories:140,protein_g:5,carbs_g:7,fat_g:11};
assert.equal(needsFavoriteRecalculation(old,old),false);
assert.equal(needsFavoriteRecalculation(old,old,true),true);
assert.equal(needsFavoriteRecalculation({...old,notes:old.notes+'; add salt'},old),true);
assert.equal(needsFavoriteRecalculation({...old,serving_description:'half muffin'},old),true);
assert.equal(needsFavoriteRecalculation({...old,nickname:'My muffin'},old),false);
assert.equal(needsFavoriteRecalculation({...old,calories:141},old),false);
assert.equal(needsFavoriteRecalculation({...old,calories:0,protein_g:0,carbs_g:0,fat_g:0},null),true);
assert.equal(needsFavoriteRecalculation({...old,item_type:'packaged_product',calories:0,protein_g:0,carbs_g:0,fat_g:0},null),false);
console.log('Favorite triggers: automatic recipe/portion edits, zero-valued new recipe, explicit unchanged retry, and preserved manual corrections passed.');

const hand={...old,calories:144,protein_g:5.7,carbs_g:6.6,fiber_g:2.9,net_carbs_g:3.7,fat_g:11,sodium_mg:130,notes:'Corrected recipe details'};
assert.equal(needsFavoriteRecalculation(hand,old),false,'manual numbers win over simultaneous recipe edits');
assert.equal(needsFavoriteRecalculation(hand,old,true),true,'explicit retry still requests AI');
const saved=manualFavoriteNutrition(hand,old);assert.equal(saved.evidence_type,'manual');assert.equal(saved.components.length,1);assert.equal(saved.components[0].calories,144);assert.equal(saved.components[0].carbs_g,6.6);assert.equal(saved.components[0].net_carbs_g,3.7);assert.equal(saved.components[0].inflammation_score,undefined);
assert.equal(needsFavoriteRecalculation({...saved,notes:'Later description correction'},saved),false,'manual authority persists across saves');
assert.equal(needsFavoriteRecalculation({...saved,notes:'Later description correction'},saved,true),true);
