import { inflammationImpact, inflammationScore } from "./inflammation-impact.js?v=20260813-4";

const nutritionFields = [
  "calories",
  "protein_g",
  "carbs_g",
  "net_carbs_g",
  "fat_g",
  "fiber_g",
  "hydration_ounces"
];

const componentEvidenceTypes = new Set([
  "nutrition_label",
  "photo_estimate",
  "description_estimate"
]);

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 10) / 10 : 0;
}

function cleanName(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeFavoriteComponents(components, fallbackEvidence = "description_estimate") {
  const safeFallback = componentEvidenceTypes.has(fallbackEvidence)
    ? fallbackEvidence
    : "description_estimate";
  if (!Array.isArray(components)) return [];
  return components.slice(0, 15).map((component, index) => {
    const normalized = {
      name: cleanName(component?.name).slice(0, 80) || `Item ${index + 1}`,
      evidence_type: componentEvidenceTypes.has(component?.evidence_type)
        ? component.evidence_type
        : safeFallback,
      confidence: ["low", "medium", "high"].includes(component?.confidence)
        ? component.confidence
        : "medium"
    };
    nutritionFields.forEach((field) => { normalized[field] = safeNumber(component?.[field]); });
    const impactScore = inflammationScore(component?.inflammation_score);
    if (impactScore !== null) {
      normalized.inflammation_score = impactScore;
      normalized.inflammation_impact = inflammationImpact(component?.inflammation_impact);
      normalized.inflammation_note = cleanName(component?.inflammation_note).slice(0, 140) || "Estimated food-pattern impact.";
    }
    return normalized;
  });
}

export function favoriteMealEvidence(components, estimateSource = "") {
  const evidence = new Set(components.map((component) => component.evidence_type));
  const hasLabel = evidence.has("nutrition_label");
  const hasEstimate = evidence.has("photo_estimate") || evidence.has("description_estimate");
  if (hasLabel && hasEstimate) return "mixed_estimate";
  if (hasLabel) return "nutrition_label";
  if (evidence.has("photo_estimate") || estimateSource === "meal_photo_estimate") return "photo_estimate";
  return "description_estimate";
}

export function favoriteMealEvidenceNotes(components) {
  const grouped = {
    nutrition_label: [],
    photo_estimate: [],
    description_estimate: []
  };
  components.forEach((component) => grouped[component.evidence_type]?.push(component.name));
  const notes = [];
  if (grouped.nutrition_label.length) notes.push(`Label values: ${grouped.nutrition_label.join(", ")}.`);
  if (grouped.photo_estimate.length) notes.push(`Estimated from photo: ${grouped.photo_estimate.join(", ")}.`);
  if (grouped.description_estimate.length) notes.push(`Estimated from description: ${grouped.description_estimate.join(", ")}.`);
  if (grouped.nutrition_label.length) notes.push("Readable label values override conflicting description-based estimates.");
  notes.push("Review when ingredients, portions, or preparation change.");
  return notes.join(" ").slice(0, 1000);
}

export function favoriteMealName(description, mealLabel, components) {
  const componentNames = components.map((component) => component.name).filter(Boolean).slice(0, 3);
  const componentTitle = componentNames.join(" + ");
  if (componentTitle && componentTitle.length <= 120) return componentTitle;
  const typed = cleanName(description);
  if (typed && !/^(meal photo|new meal)$/i.test(typed)) return typed.slice(0, 120);
  return `${cleanName(mealLabel) || "Meal"} favorite`;
}

export function favoriteMealFromEstimate({ description, mealLabel, estimate }) {
  const fallbackEvidence = estimate?.source === "meal_photo_estimate" || estimate?.source === "nutrition_label_photo"
    ? "photo_estimate"
    : "description_estimate";
  const components = normalizeFavoriteComponents(estimate?.components, fallbackEvidence);
  const evidenceType = favoriteMealEvidence(components, estimate?.source);
  const meal = {
    item_type: "home_meal",
    name: favoriteMealName(description, mealLabel, components),
    brand_or_restaurant: "",
    serving_description: "1 usual meal",
    evidence_type: evidenceType,
    confidence: ["low", "medium", "high"].includes(estimate?.confidence) ? estimate.confidence : "medium",
    notes: favoriteMealEvidenceNotes(components),
    components,
    sugar_alcohols_g: 0,
    allulose_g: 0
  };
  nutritionFields.forEach((field) => { meal[field] = safeNumber(estimate?.[field]); });
  return meal;
}

export { nutritionFields as favoriteMealNutritionFields };
