export const savedFoodNutrients = ['calories','protein_g','carbs_g','net_carbs_g','fat_g','fiber_g','sodium_mg','added_sugar_g','saturated_fat_g','sugar_alcohols_g','allulose_g','hydration_ounces'];
export function validateSavedFoodAnalysis(food) {
 if (!food || typeof food !== 'object' || Array.isArray(food)) throw new Error('The nutrition analysis was incomplete. Your saved values were not replaced. Please recalculate.');
 const missing=savedFoodNutrients.filter(field=>typeof food[field]!=='number'||!Number.isFinite(food[field])||food[field]<0);
 if(missing.length)throw new Error(`The nutrition analysis omitted valid values (${missing.join(', ')}). Your saved values were not replaced. Please recalculate.`);
 if(food.item_type==='home_meal' && savedFoodNutrients.every(field=>food[field]===0))throw new Error('The recipe analysis returned only zeros. Your saved values were not replaced. Please check the ingredients and recalculate.');
 if(food.net_carbs_g>food.carbs_g+0.1||food.fiber_g>food.carbs_g+0.1)throw new Error('The nutrition analysis returned inconsistent carbohydrate values. Your saved values were not replaced. Please recalculate.');
 return food;
}
