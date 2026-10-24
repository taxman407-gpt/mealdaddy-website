export const savedFoodNutrients = ['calories','protein_g','carbs_g','net_carbs_g','fat_g','fiber_g','sodium_mg','added_sugar_g','saturated_fat_g','sugar_alcohols_g','allulose_g','hydration_ounces'];
export function validateSavedFoodAnalysis(food) {
 if (!food || typeof food !== 'object' || Array.isArray(food)) throw new Error('The nutrition analysis was incomplete. Your saved values were not replaced. Please recalculate.');
 const missing=savedFoodNutrients.filter(field=>typeof food[field]!=='number'||!Number.isFinite(food[field])||food[field]<0);
 if(missing.length)throw new Error(`The nutrition analysis omitted valid values (${missing.join(', ')}). Your saved values were not replaced. Please recalculate.`);
 if(food.item_type==='home_meal' && savedFoodNutrients.every(field=>food[field]===0))throw new Error('The recipe analysis returned only zeros. Your saved values were not replaced. Please check the ingredients and recalculate.');
 if(food.net_carbs_g>food.carbs_g+0.1||food.fiber_g>food.carbs_g+0.1)throw new Error('The nutrition analysis returned inconsistent carbohydrate values. Your saved values were not replaced. Please recalculate.');
 return food;
}

export function totalSavedFoodComponents(food) {
 if(!Array.isArray(food.components)||!food.components.length)throw new Error('The analysis omitted its ingredient breakdown. Your saved values were not replaced. Please recalculate.');
 const divisor=food.servings_in_recipe;
 if(typeof divisor!=='number'||!Number.isFinite(divisor)||divisor<0.1||divisor>1000)throw new Error('The recipe yield is missing or invalid. Your saved values were not replaced.');
 const fields=savedFoodNutrients.filter(f=>!['sugar_alcohols_g','allulose_g'].includes(f));
 for(const component of food.components){if(fields.some(field=>typeof component[field]!=='number'||!Number.isFinite(component[field])||component[field]<0))throw new Error('An ingredient has incomplete nutrition. Your saved values were not replaced. Please recalculate.');}
 food.components=food.components.map(component=>({...component,name:divisor===1?component.name:`1/${divisor} of ${component.name}`,...Object.fromEntries(fields.map(field=>[field,Math.round(component[field]/divisor*100)/100]))}));
 for(const field of fields)food[field]=Math.round(food.components.reduce((sum,c)=>sum+c[field],0)*10)/10;
 delete food.servings_in_recipe;
 return food;
}
