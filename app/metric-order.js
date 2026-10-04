export const TODAY_METRICS = [
  { key: "calories", label: "Calories" },
  { key: "protein", label: "Protein" },
  { key: "totalCarbs", label: "Total carbs" },
  { key: "netCarbs", label: "Net carbs" },
  { key: "fat", label: "Fat" },
  { key: "fiber", label: "Fiber" },
  { key: "water", label: "Hydration" },
  { key: "inflammation", label: "Inflammation" },
  { key: "sodium", label: "Sodium", optional: true },
  { key: "addedSugar", label: "Added sugar", optional: true },
  { key: "saturatedFat", label: "Saturated fat", optional: true }
];

const validKeys = new Set(TODAY_METRICS.map(({ key }) => key));
export const OPTIONAL_METRICS = TODAY_METRICS.filter(({ optional }) => optional);
export const CORE_METRIC_KEYS = TODAY_METRICS.filter(({ optional }) => !optional).map(({ key }) => key);

export function normalizeOptionalMetrics(value) {
  return Array.isArray(value)
    ? value.filter((key, index) => OPTIONAL_METRICS.some((metric) => metric.key === key) && value.indexOf(key) === index)
    : [];
}

export function defaultMetricOrder(profile = {}) {
  const goals = Array.isArray(profile.primary_goals) ? profile.primary_goals : [];
  const styles = Array.isArray(profile.eating_styles) ? profile.eating_styles : [];
  const context = [profile.primary_eating_style, ...goals, ...styles]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  const prioritized = [];
  const add = (...keys) => keys.forEach((key) => { if (!prioritized.includes(key)) prioritized.push(key); });

  if (/inflamm/.test(context)) add("inflammation", "fiber");
  if (/low carb|keto|blood sugar|diabet/.test(context)) add("netCarbs", "totalCarbs", "protein");
  if (/gain muscle|high protein/.test(context)) add("protein", "calories");
  if (/lose weight|maintain weight/.test(context)) add("calories", "protein");
  if (/heart|mediterranean|dash/.test(context)) add("fiber", "fat", "inflammation");
  add(...CORE_METRIC_KEYS, ...normalizeOptionalMetrics(profile.today_optional_metrics));
  return prioritized;
}

export function normalizeMetricOrder(value, profile = {}) {
  const available = new Set([...CORE_METRIC_KEYS, ...normalizeOptionalMetrics(profile.today_optional_metrics)]);
  const supplied = Array.isArray(value) ? value.filter((key, index) => validKeys.has(key) && available.has(key) && value.indexOf(key) === index) : [];
  return [...supplied, ...defaultMetricOrder(profile).filter((key) => available.has(key) && !supplied.includes(key))];
}

export function metricLabel(key) {
  return TODAY_METRICS.find((metric) => metric.key === key)?.label || key;
}

export function moveMetric(order, key, direction) {
  const optional = order.filter((item) => OPTIONAL_METRICS.some(({ key: optionalKey }) => optionalKey === item));
  const normalized = normalizeMetricOrder(order, { today_optional_metrics: optional });
  const index = normalized.indexOf(key);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= normalized.length) return normalized;
  [normalized[index], normalized[nextIndex]] = [normalized[nextIndex], normalized[index]];
  return normalized;
}

export function moveMetricToPosition(order, key, position) {
  const optional = order.filter((item) => OPTIONAL_METRICS.some(({ key: optionalKey }) => optionalKey === item));
  const normalized = normalizeMetricOrder(order, { today_optional_metrics: optional });
  const currentIndex = normalized.indexOf(key);
  const nextIndex = Math.min(normalized.length - 1, Math.max(0, Number(position) - 1));
  if (currentIndex < 0 || !Number.isFinite(nextIndex) || currentIndex === nextIndex) return normalized;
  normalized.splice(currentIndex, 1);
  normalized.splice(nextIndex, 0, key);
  return normalized;
}
