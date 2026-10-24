/** Percent applies to the whole described meal, exactly once. */
export function splitMealPortion(description) {
  const text = String(description || '').trim();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*%\s+(?:of\s+)?(.+)$/is);
  return match ? { description: match[2].trim(), percentage: Number(match[1]) } : { description: text, percentage: 100 };
}
export function mealDescriptionWithPortion(description, percentage) {
  const parsed = splitMealPortion(description);
  let value = Number(percentage);
  if (!String(percentage).trim() || !Number.isFinite(value) || value < 0 || value > 1000) throw new Error('Enter a meal percentage from 0 to 1000.');
  if (parsed.percentage !== 100 && value !== 100 && parsed.percentage !== value) throw new Error('The description and percent-consumed field disagree. Put the percentage in the percent field only.');
  if (value === 100 && parsed.percentage !== 100) value = parsed.percentage;
  if (!parsed.description) throw new Error('Enter a meal description.');
  return value === 100 ? parsed.description : `${value}% ${parsed.description}`;
}

const portionNutrients = ['calories','protein_g','carbs_g','net_carbs_g','fat_g','fiber_g','sodium_mg','added_sugar_g','saturated_fat_g','hydration_ounces'];
/** Reuse saved quantities for percentage-only edits; never ask AI to replace them. */
export function scaleSavedMealPortion(entry, description) {
  const before = splitMealPortion(entry.description);
  const after = splitMealPortion(description);
  if (entry.kind !== 'meal' || entry.status !== 'estimated' || before.description !== after.description || before.percentage === after.percentage) return null;
  const current = entry.nutrition_estimate;
  if (!current || typeof current.calories !== 'number') return null;
  if (current.leftover_adjustment) throw new Error('Undo the after-meal portion correction before changing the whole-meal percentage.');
  if (current.photo_review?.length) throw new Error('Confirm the suspected photo items before changing the meal percentage.');
  const prior = current.saved_portion_basis;
  const basis = prior || { percentage: before.percentage, estimate: structuredClone(current) };
  if (!(basis.percentage > 0) || !Number.isFinite(basis.percentage)) throw new Error('The original nutrition for this zero-percent meal is unavailable. Restore the full meal description before recalculating.');
  if (!Number.isFinite(after.percentage) || after.percentage < 0 || after.percentage > 1000) throw new Error('Enter a meal percentage from 0 to 1000.');
  const result = structuredClone(basis.estimate);
  const ratio = after.percentage / basis.percentage;
  const scale = item => {
    for (const field of portionNutrients) if (typeof item[field] === 'number') {
      if (!Number.isFinite(item[field]) || item[field] < 0) throw new Error('Saved nutrition contains an invalid value. Review it before changing portions.');
      item[field] = Math.round(item[field] * ratio * 10000) / 10000;
    }
  };
  scale(result);
  if (Array.isArray(result.components)) result.components.forEach(item => {
    scale(item);
    item.name = String(item.name || '').replace(/\s*\([\d.]+% eaten\)$/, '');
    if (after.percentage !== 100) item.name += ` (${after.percentage}% eaten)`;
  });
  result.consumed_fraction = after.percentage / 100;
  result.portion_calculation = 'saved_values_scaled_once';
  result.saved_portion_basis = structuredClone(basis);
  return result;
}
