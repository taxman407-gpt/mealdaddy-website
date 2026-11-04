// Deterministic, provider-independent shopping logic. No network or account writes.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fraction = value => {
  const m = String(value).match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (m) return Number(m[3]) ? Number(m[1] || 0) + Number(m[2]) / Number(m[3]) : NaN;
  return Number(value);
};
export function parseAmount(amount) {
  const text = String(amount ?? '').trim();
  const match = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+)\s*([a-zA-Z ]*)$/);
  if (!match) return { quantity: null, unit: '', original: text };
  const quantity = fraction(match[1]);
  let unit = match[2].trim().toLowerCase();
  const aliases = { grams:'g', gram:'g', kilograms:'kg', kilogram:'kg', ounces:'oz', ounce:'oz', pounds:'lb', pound:'lb', lbs:'lb', teaspoons:'tsp', teaspoon:'tsp', tablespoons:'tbsp', tablespoon:'tbsp', cups:'cup', milliliters:'ml', milliliter:'ml', liters:'l', liter:'l', pieces:'each', piece:'each' };
  unit = aliases[unit] || unit;
  return { quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : null, unit, original: text };
}
export function ingredientLines(ingredients = []) {
  return ingredients.map(i => `${i.amount || ''} | ${i.item || ''}`).join('\n');
}
export function parseIngredients(text) {
  return String(text).split('\n').filter(line => line.trim()).map(line => {
    const split = line.indexOf('|');
    return split < 0 ? {amount:'',item:line.trim()} : {amount:line.slice(0,split).trim(),item:line.slice(split+1).trim()};
  }).filter(i => i.item);
}
export function buildShoppingRows(sources, previous = []) {
  const rows = new Map();
  for (const source of sources.filter(s => s.active !== false)) {
    const base = Number(source.baseServings), servings = Number(source.servings);
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(servings) || servings <= 0 || servings > 100) throw new Error('Choose valid servings between 0 and 100.');
    for (const [index, ingredient] of source.ingredients.entries()) {
      if (!String(ingredient.item || '').trim()) continue;
      const parsed = parseAmount(ingredient.amount);
      const key = JSON.stringify([String(ingredient.item).trim().toLowerCase(), parsed.unit, parsed.quantity === null ? `${source.id}:${index}` : '']);
      const row = rows.get(key) || {key,item:ingredient.item,unit:parsed.unit,needed:parsed.quantity === null ? null : 0,original:parsed.original,sourceIds:[],onHand:'',override:'',checked:false,excluded:false};
      if (parsed.quantity !== null) row.needed += parsed.quantity * servings / base;
      if (!row.sourceIds.includes(source.id)) row.sourceIds.push(source.id);
      rows.set(key,row);
    }
  }
  for (const row of rows.values()) {
    const old = previous.find(p => p.key === row.key);
    if (old) {
      for (const field of ['onHand','override','checked','excluded']) row[field] = old[field];
      row.review = Boolean(old.review || (old.needed !== row.needed && (old.override || old.checked || old.onHand !== '')));
    }
  }
  // Preserve manually added or adjusted lines, including lines no longer required.
  for (const old of previous) {
    if (rows.has(old.key)) continue;
    if (old.manual || old.override || old.onHand !== '' || old.checked || old.excluded) rows.set(old.key,{...old,retired:!old.manual,review:!old.manual || old.review});
  }
  return [...rows.values()];
}
export function purchaseAmount(row) {
  if (String(row.override || '').trim()) return String(row.override).trim();
  if (row.needed === null) return `${row.original || 'Quantity unknown'} — check quantity`;
  const stock = row.onHand === '' ? 0 : Number(row.onHand);
  if (!Number.isFinite(stock) || stock < 0) throw new Error('On-hand amounts must be nonnegative numbers in the displayed unit.');
  return `${Number(Math.max(0,row.needed-stock).toFixed(3))}${row.unit ? ` ${row.unit}` : ''}${row.onHand === '' ? ' (stock not checked)' : ''}`;
}
export function sourceLink(base, sourceId) {
  const url = new URL(base);
  url.search = '?view=more';
  url.hash = `shopping-source=${encodeURIComponent(sourceId)}`;
  return url.href;
}
export function shoppingText(list, base) {
  const lines = [list.title || 'Shopping list', 'MealDaddy — editable text copy', list.dirty ? 'SOURCE CHANGES PENDING: review and refresh quantities in the app.' : '', ''];
  for (const row of list.rows.filter(r => !r.excluded)) {
    lines.push(`[${row.checked ? 'x' : ' '}] ${row.item} — ${purchaseAmount(row)}${row.review ? ' [REVIEW]' : ''}${row.retired ? ' [NO LONGER REQUIRED]' : ''}`);
    for (const id of row.sourceIds || []) {
      const source = list.sources.find(s => s.id === id);
      if (source) lines.push(`    From: ${source.title} — ${sourceLink(base,id)}`);
    }
  }
  lines.push('', 'SOURCE MEALS / RECIPES', 'Source links require the same signed-in account and this device’s saved beta list.');
  for (const source of list.sources) lines.push('',source.title,source.description,`Servings: ${source.servings}`,sourceLink(base,source.id));
  lines.push('', 'Editing this exported file does not update MealDaddy automatically.');
  return lines.join('\n');
}
export function recipeText(recipe) {
  const n = recipe.nutrition || {};
  return [recipe.title,recipe.summary,`Yield: ${recipe.servings} servings`,'','INGREDIENTS',...recipe.ingredients.map(i => `${i.amount || ''} ${i.item}`.trim()),'','INSTRUCTIONS',...recipe.instructions.map((s,i) => `${i+1}. ${s}`),'','SUBSTITUTIONS',...(recipe.substitutions || []),'','Estimated per serving',...Object.entries(n).map(([key,value]) => `${key.replaceAll('_',' ')}: ${value}`),recipe.source_note || 'Nutrition is estimated.'].join('\n');
}
