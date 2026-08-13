export const restaurantChoiceLetters = ["A", "B", "C"];
export const restaurantFitLabels = ["Best fit", "Balanced choice", "Treat option"];

export function safeRestaurantSourceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeRestaurantPlan(rawPlan, today = new Date().toISOString().slice(0, 10)) {
  const options = Array.isArray(rawPlan?.options) ? rawPlan.options.slice(0, 3) : [];
  if (options.length !== 3) return null;
  return {
    restaurant: String(rawPlan.restaurant || "Restaurant").slice(0, 160),
    overview: String(rawPlan.overview || "Here are three ways to order around your goals.").slice(0, 500),
    source_checked_on: String(rawPlan.source_checked_on || today).slice(0, 10),
    options: options.map((option, index) => ({
      ...option,
      label: restaurantChoiceLetters[index],
      fit: restaurantFitLabels[index]
    }))
  };
}

export function restaurantOptionToSavedFood(plan, option) {
  const substitutions = Array.isArray(option.substitutions)
    ? option.substitutions.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
    : [];
  const sourceUrl = safeRestaurantSourceUrl(option.source_url);
  const notes = [
    `Customized order: ${String(option.order || "").trim()}`,
    substitutions.length ? `Substitutions: ${substitutions.join("; ")}` : "",
    String(option.why || "").trim(),
    sourceUrl ? `Source checked ${plan.source_checked_on}: ${sourceUrl}` : `Published nutrition not confirmed; estimated ${plan.source_checked_on}.`
  ].filter(Boolean).join("\n").slice(0, 1000);
  return {
    item_type: "restaurant_item",
    name: String(option.title || `${plan.restaurant} customized meal`).slice(0, 160),
    brand_or_restaurant: plan.restaurant,
    serving_description: "1 customized order",
    calories: Number(option.calories || 0),
    protein_g: Number(option.protein_g || 0),
    carbs_g: Number(option.carbs_g || 0),
    net_carbs_g: Number(option.net_carbs_g || 0),
    fat_g: Number(option.fat_g || 0),
    fiber_g: Number(option.fiber_g || 0),
    sugar_alcohols_g: 0,
    allulose_g: 0,
    hydration_ounces: 0,
    evidence_type: option.evidence_type === "restaurant_published" && sourceUrl ? "restaurant_published" : "restaurant_estimate",
    confidence: ["low", "medium", "high"].includes(option.confidence) ? option.confidence : "medium",
    notes
  };
}

export function restaurantOptionToLedgerEntry(plan, option) {
  const substitutions = Array.isArray(option.substitutions)
    ? option.substitutions.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
    : [];
  const sourceUrl = safeRestaurantSourceUrl(option.source_url);
  const order = String(option.order || option.title || "Customized restaurant order").replace(/\s+/g, " ").trim();
  const evidenceType = option.evidence_type === "restaurant_published" && sourceUrl
    ? "restaurant_published"
    : "restaurant_estimate";
  return {
    description: [
      `${plan.restaurant}: ${order}`,
      substitutions.length ? `Substitutions: ${substitutions.join("; ")}` : ""
    ].filter(Boolean).join(". ").slice(0, 1200),
    nutrition_estimate: {
      calories: Number(option.calories || 0),
      protein_g: Number(option.protein_g || 0),
      carbs_g: Number(option.carbs_g || 0),
      net_carbs_g: Number(option.net_carbs_g || 0),
      fat_g: Number(option.fat_g || 0),
      fiber_g: Number(option.fiber_g || 0),
      hydration_ounces: 0,
      confidence: ["low", "medium", "high"].includes(option.confidence) ? option.confidence : "medium",
      note: String(option.why || "Restaurant nutrition varies by location, preparation, and portion.").slice(0, 300),
      source: evidenceType,
      restaurant: plan.restaurant,
      restaurant_order: order,
      substitutions,
      source_url: sourceUrl,
      source_checked_on: plan.source_checked_on
    }
  };
}
