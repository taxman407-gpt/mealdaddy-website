export function metricProgressSegments(value, goal) {
  const safeValue = Math.max(0, Number(value) || 0);
  const safeGoal = Math.max(1, Number(goal) || 1);
  if (safeValue <= safeGoal) {
    return { goalWidth: Math.min(100, (safeValue / safeGoal) * 100), excessWidth: 0, over: false };
  }
  return {
    goalWidth: 80,
    excessWidth: Math.min(20, Math.max(4, ((safeValue - safeGoal) / safeGoal) * 80)),
    over: true
  };
}
