const validImpacts = new Set(["helpful", "neutral", "watch"]);

export function inflammationScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 10) return null;
  return Math.round(number * 10) / 10;
}

export function inflammationBand(value) {
  const score = inflammationScore(value);
  if (score === null) return { label: "Not scored", tone: "unknown" };
  if (score <= 3) return { label: "Lower impact", tone: "lower" };
  if (score <= 6) return { label: "Mixed impact", tone: "moderate" };
  return { label: "Higher impact", tone: "higher" };
}

export function inflammationImpact(value) {
  return validImpacts.has(value) ? value : "neutral";
}

export function weightedInflammationScore(components) {
  if (!Array.isArray(components)) return null;
  const scored = components
    .map((component) => ({
      score: inflammationScore(component?.inflammation_score),
      weight: Math.max(1, Number(component?.calories) || 0)
    }))
    .filter((component) => component.score !== null);
  if (!scored.length) return null;
  const totalWeight = scored.reduce((sum, component) => sum + component.weight, 0);
  return Math.round((scored.reduce((sum, component) => sum + component.score * component.weight, 0) / totalWeight) * 10) / 10;
}

export function estimateInflammationScore(nutrition = {}) {
  return inflammationScore(nutrition.inflammation_score) ?? weightedInflammationScore(nutrition.components);
}

export function summarizeInflammationEntries(entries = []) {
  const meals = entries.filter((entry) => entry?.kind === "meal" && entry.status !== "pending_estimate");
  const scoredMeals = meals
    .map((entry) => ({
      entry,
      score: estimateInflammationScore(entry.nutrition_estimate || {}),
      weight: Math.max(1, Number(entry.nutrition_estimate?.calories) || 0)
    }))
    .filter((item) => item.score !== null);
  if (!scoredMeals.length) {
    return { score: null, scoredMeals: 0, unscoredMeals: meals.length, highest: null };
  }
  const totalWeight = scoredMeals.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round((scoredMeals.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight) * 10) / 10;
  const highest = [...scoredMeals].sort((left, right) => right.score - left.score)[0];
  return { score, scoredMeals: scoredMeals.length, unscoredMeals: meals.length - scoredMeals.length, highest };
}

export function summarizeInflammationReport(entries = [], dateKey = (value) => String(value)) {
  const byDay = new Map();
  entries.forEach((entry) => {
    const key = dateKey(entry.occurred_at);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(entry);
  });
  const daySummaries = [...byDay.values()]
    .map((dayEntries) => summarizeInflammationEntries(dayEntries))
    .filter((summary) => summary.score !== null);
  const score = daySummaries.length
    ? Math.round((daySummaries.reduce((sum, summary) => sum + summary.score, 0) / daySummaries.length) * 10) / 10
    : null;
  const mealSummary = summarizeInflammationEntries(entries);
  return {
    score,
    scoredDays: daySummaries.length,
    scoredMeals: mealSummary.scoredMeals,
    unscoredMeals: mealSummary.unscoredMeals
  };
}
