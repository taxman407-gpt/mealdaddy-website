import { consumedPortion, applyConsumedPortion, nutrientFields } from '../../functions/_shared/estimate-edit-contract.mjs';
import { applyComponentTotals } from '../../functions/_shared/nutrition-reconciliation.mjs';
const base = Object.fromEntries(nutrientFields.map(field => [field, 0]));
const component = (name, values) => ({ ...base, name, ...values, evidence_type: 'description_estimate', confidence: 'high', inflammation_score: null, inflammation_note: 'Synthetic test fixture; no health inference.' });
const pizza = [component('Test pizza', { calories: 1000, protein_g: 60, carbs_g: 80, fiber_g: 20, net_carbs_g: 60, fat_g: 50, sodium_mg: 1600, added_sugar_g: 8, saturated_fat_g: 18 })];
const salad = [component('Test greens', { calories: 40, protein_g: 2, carbs_g: 8, fiber_g: 4, net_carbs_g: 4, sodium_mg: 20 }), component('Test chicken', { calories: 200, protein_g: 40, fat_g: 4, sodium_mg: 100 })];
const dressing = component('Test strawberry vinaigrette (1 oz)', { calories: 60, carbs_g: 6, fiber_g: 0, net_carbs_g: 6, fat_g: 4, sodium_mg: 100, added_sugar_g: 4 });
export const fixtureDescriptions = ['Test pizza', 'Test salad with dressing', 'Test salad without dressing', '1 oz test strawberry vinaigrette'];
export function fixtureEstimate(description) {
  const portion = consumedPortion(description);
  const key = portion.description.toLowerCase();
  let components;
  if (key === 'test pizza') components = pizza;
  if (key === 'test salad with dressing') components = [...salad, dressing];
  if (key === 'test salad without dressing') components = salad;
  if (key === '1 oz test strawberry vinaigrette') components = [dressing];
  if (!components) return null;
  const estimate = { components: structuredClone(components), source: 'synthetic_test_fixture', fixture: true, confidence: 'high', note: 'Fixed fictional values for software testing only. Not AI analysis or food nutrition advice.', photo_description: '', description_reconciliation_note: '', label_detected: false, inflammation_score: null, inflammation_summary: 'Not scored: synthetic test fixture.' };
  applyConsumedPortion(estimate, portion);
  return applyComponentTotals(estimate);
}
