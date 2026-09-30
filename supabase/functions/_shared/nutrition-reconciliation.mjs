const nutritionTotalFields = [
  "calories",
  "protein_g",
  "carbs_g",
  "net_carbs_g",
  "fat_g",
  "fiber_g",
  "hydration_ounces"
];

function componentKey(component) {
  return String(component.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function componentEvidencePriority(component) {
  // A readable label remains strongest. When the same photographed component
  // is repeated as typed clarification, the user's stated measurement wins
  // over the rough visual portion estimate; the two are never added together.
  return ({ nutrition_label: 3, description_estimate: 2, photo_estimate: 1 })[
    String(component.evidence_type || "")
  ] || 0;
}

export function reconcileComponents(components) {
  const reconciled = new Map();
  let duplicatesRemoved = 0;
  for (const component of components) {
    const key = componentKey(component);
    if (!key) continue;
    const existing = reconciled.get(key);
    if (!existing) {
      reconciled.set(key, component);
      continue;
    }
    duplicatesRemoved += 1;
    const existingPriority = componentEvidencePriority(existing);
    const candidatePriority = componentEvidencePriority(component);
    const existingCalories = Number(existing.calories || 0);
    const candidateCalories = Number(component.calories || 0);
    if (
      candidatePriority > existingPriority ||
      (candidatePriority === existingPriority && candidateCalories > existingCalories)
    ) {
      reconciled.set(key, component);
    }
  }
  return { components: [...reconciled.values()], duplicatesRemoved };
}

export function applyComponentTotals(estimate) {
  const components = Array.isArray(estimate.components) ? estimate.components : [];
  const reconciled = reconcileComponents(components);
  estimate.components = reconciled.components;
  for (const field of nutritionTotalFields) {
    const total = reconciled.components.reduce((sum, component) => {
      const value = Number(component[field] || 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    estimate[field] = Math.round(total * 10) / 10;
  }
  estimate.calculation_method = "sum_of_reconciled_components";
  estimate.duplicate_components_removed = reconciled.duplicatesRemoved;
  return estimate;
}
