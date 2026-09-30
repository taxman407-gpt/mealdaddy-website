function normalizedStyle(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolvePrimaryEatingStyle({ dietStyle = "", primaryEatingStyle = "", eatingStyles = [] } = {}) {
  const selected = Array.isArray(eatingStyles) ? eatingStyles.filter(Boolean) : [];
  if (primaryEatingStyle) return primaryEatingStyle;
  if (dietStyle) return dietStyle;
  return selected[0] || "Flexible";
}

export function includePrimaryEatingStyle(primaryEatingStyle, eatingStyles = []) {
  const primary = String(primaryEatingStyle || "").trim();
  const selected = Array.isArray(eatingStyles) ? [...eatingStyles] : [];
  if (!primary || normalizedStyle(primary) === "none" || normalizedStyle(primary) === "flexible") return selected;
  if (!selected.some((style) => normalizedStyle(style) === normalizedStyle(primary))) selected.unshift(primary);
  return selected;
}
