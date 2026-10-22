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
