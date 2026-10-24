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

// Apply unambiguous, user-supplied label statements with matching volume units.
// Unrecognized text stays an estimate; it is never guessed into a label override.
export function applyWrittenLabelValues(food, context='') {
 const quantity='(\\d+(?:\\.\\d+)?(?:\\s+\\d+/\\d+)?|\\d+/\\d+)';
 const unit='(cups?|tbsp|tablespoons?|tsp|teaspoons?)';
 const parseAmount=s=>s.trim().split(/\s+/).reduce((sum,p)=>sum+(p.includes('/')?Number(p.split('/')[0])/Number(p.split('/')[1]):Number(p)),0);
 const volume=u=>/^cup/i.test(u)?48:/^(tbsp|tablespoon)/i.test(u)?3:1;
 const clean=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
 const linePattern=new RegExp('^[•*\\-]?\\s*'+quantity+'\\s*'+unit+'\\s+(.+?)\\s*[—–]\\s*label:\\s*(.+?)\\s+per\\s+'+quantity+'\\s*'+unit,'i');
 const fields={calories:'calories',protein:'protein_g',carbs:'carbs_g',carbohydrates:'carbs_g',fat:'fat_g',fiber:'fiber_g'};
 for(const line of context.split('\n')){
  const m=line.trim().match(linePattern);if(!m)continue;
  const factor=parseAmount(m[1])*volume(m[2])/(parseAmount(m[5])*volume(m[6]));
  if(!Number.isFinite(factor)||factor<=0)continue;
  const matches=food.components?.filter(c=>clean(c.name).includes(clean(m[3])))||[];
  if(matches.length!==1)continue;
  const values={};for(const v of m[4].matchAll(/(\d+(?:\.\d+)?)\s*(?:g\s+)?(calories|protein|carbs|carbohydrates|fat|fiber)\b/gi))values[fields[v[2].toLowerCase()]]=Number(v[1])*factor;
  if(!Object.keys(values).length)continue;
  Object.assign(matches[0],values);
  if(values.carbs_g!==undefined && values.fiber_g!==undefined)matches[0].net_carbs_g=Math.max(0,values.carbs_g-values.fiber_g);
 }
 return food;
}
