const clinicianSource = "Clinician recommended";

function finiteNonnegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function adaptiveHydrationGuidance({
  hydrationOunces,
  hydrationGoalOunces,
  sodiumMg,
  sodiumGoalMg,
  targetSource,
  hour = new Date().getHours()
}) {
  const consumed = finiteNonnegative(hydrationOunces);
  const goal = Math.max(1, finiteNonnegative(hydrationGoalOunces, 1));
  const sodium = sodiumMg === null || sodiumMg === undefined ? null : finiteNonnegative(sodiumMg);
  const sodiumGoal = Math.max(1, finiteNonnegative(sodiumGoalMg, 2300));
  const remaining = Math.max(0, goal - consumed);
  const over = Math.max(0, consumed - goal);
  const clinicianSet = targetSource === clinicianSource;
  const sodiumHigh = sodium !== null && sodium >= sodiumGoal;
  const sourceLabel = clinicianSet ? "clinician-recommended" : "saved";
  const roundedGoal = Math.round(goal);
  const roundedRemaining = Math.round(remaining);
  const roundedOver = Math.round(over);
  const pacedAmount = Math.min(12, roundedRemaining);

  let action = "";
  if (over > 0) {
    action = `You are about ${roundedOver} oz above your ${roundedGoal} oz ${sourceLabel} target. Do not add extra fluid just because sodium is elevated; follow the target and instructions from your care team.`;
  } else if (remaining === 0) {
    action = `You have reached your ${roundedGoal} oz ${sourceLabel} target. Keep that limit in view and follow any instructions from your care team.`;
  } else if (hour >= 12 && consumed / goal < 0.35) {
    action = `You have about ${roundedRemaining} oz remaining within your ${roundedGoal} oz ${sourceLabel} target. If it fits your care plan, pace up to ${pacedAmount} oz with your next meal or break.`;
  } else {
    action = `You have about ${roundedRemaining} oz remaining within your ${roundedGoal} oz ${sourceLabel} target. Pace fluids across the rest of the day without exceeding it.`;
  }

  const sodiumNote = sodiumHigh
    ? ` Estimated sodium is at or above your ${Math.round(sodiumGoal).toLocaleString()} mg target. Favor lower-sodium choices next; MealDaddy will not raise your fluid target automatically.`
    : sodium === null
      ? " Sodium has not been estimated for enough of today’s intake to adjust the context reliably."
      : "";

  return {
    consumed,
    goal,
    remaining,
    over,
    clinicianSet,
    sodiumHigh,
    message: `${action}${sodiumNote}`
  };
}

export { clinicianSource as CLINICIAN_HYDRATION_SOURCE };
