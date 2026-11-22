// Request/output boundaries for the opt-in beta pantry-review endpoint.
const reject = message => {throw Object.assign(new Error(message), {status: 422});};
const clean = (value, length, label) => {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > length) reject(`${label} is too long or invalid. Nothing was silently omitted.`);
  return value.trim();
};
export function parsePantryRequest(body, userId) {
  if (!body || !['interpret', 'plan'].includes(body.action)) reject('Choose photo interpretation or a confirmed meal plan.');
  if (body.action === 'interpret') {
    const description = clean(body.description, 1600, 'Food description');
    const photoPaths = body.photoPaths === undefined ? [] : body.photoPaths;
    if (!Array.isArray(photoPaths) || photoPaths.length > 6 || new Set(photoPaths).size !== photoPaths.length) reject('Use up to six distinct pantry photos.');
    for (const path of photoPaths) {
      if (typeof path !== 'string' || !path.startsWith(`${userId}/pantry-scan-`) ||
          !/^[a-f0-9-]{36}\.jpg$/i.test(path.slice(`${userId}/pantry-scan-`.length))) reject('A valid private pantry photo from your own account is required.');
    }
    if (!photoPaths.length && !description) reject('Add pantry photos or describe the available foods.');
    return {action: 'interpret', description, photoPaths};
  }
  if (body.confirmed !== true) reject('Review and confirm the food interpretation before generating a plan.');
  if (body.photoPaths?.length || body.photoPath) reject('Meal planning accepts only the confirmed food list, not unreviewed photos.');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 60) reject('Confirm between one and sixty foods.');
  const names = new Set();
  const items = body.items.map(item => {
    const name = clean(item?.name, 160, 'Food name'), quantity = clean(item?.quantity, 100, 'Quantity');
    if (!name || names.has(name.toLocaleLowerCase())) reject('Check for missing or duplicate food names.');
    names.add(name.toLocaleLowerCase()); return {name, quantity};
  });
  const nutritionContext = {};
  for (const field of ['calories','protein','totalCarbs','netCarbs','netCarbGoal','hydrationOunces','hydrationGoalOunces','sodiumMg','sodiumGoalMg']) {
    const value = body.nutritionContext?.[field];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000) reject('Nutrition context is invalid.');
    nutritionContext[field] = value;
  }
  return {action: 'plan', items, preferences: clean(body.preferences, 1000, 'Meal preferences'), photoPaths: [], nutritionContext};
}
export const pantryInterpretationFormat = {type: 'json_schema', name: 'pantry_interpretation', strict: true, schema: {
  type: 'object', additionalProperties: false, properties: {items: {type: 'array', maxItems: 60, items: {
    type: 'object', additionalProperties: false, properties: {
      name: {type: 'string'}, quantity: {type: 'string'}, confidence: {type: 'string', enum: ['high','medium','low']},
      note: {type: 'string'}, photo_numbers: {type: 'array', items: {type: 'integer', minimum: 1, maximum: 6}}
    }, required: ['name','quantity','confidence','note','photo_numbers']
  }}}, required: ['items']
}};
export function validatePantryInterpretation(value, photoCount) {
  if (!value || !Array.isArray(value.items) || value.items.length > 60) reject('The interpretation was incomplete. Your photos and written description are kept for another try.');
  const names = new Set();
  return value.items.map(item => {
    const name = clean(item?.name, 160, 'Identified food'), quantity = clean(item?.quantity, 100, 'Identified quantity'), note = clean(item?.note, 300, 'Identification note');
    if (!name || !['high','medium','low'].includes(item?.confidence) || !Array.isArray(item?.photo_numbers) ||
        item.photo_numbers.some(n => !Number.isInteger(n) || n < 1 || n > photoCount)) reject('The interpretation contains invalid food or photo references.');
    if (names.has(name.toLocaleLowerCase())) reject('The interpretation repeats a food. Retry or enter the foods manually rather than double-counting them.');
    names.add(name.toLocaleLowerCase());
    return {name, quantity, note, confidence: item.confidence, photo_numbers: [...new Set(item.photo_numbers)]};
  });
}
