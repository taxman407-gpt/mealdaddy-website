const POUNDS_PER_KILOGRAM = 2.2046226218;

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeUnitSystem(value) {
  return String(value || "").toLowerCase() === "metric" ? "metric" : "us";
}

export function weightToKg(value, unitSystem = "us") {
  const number = numeric(value);
  if (number === null || number <= 0) return null;
  return normalizeUnitSystem(unitSystem) === "metric" ? number : number / POUNDS_PER_KILOGRAM;
}

export function weightFromKg(value, unitSystem = "us") {
  const number = numeric(value);
  if (number === null || number <= 0) return null;
  return normalizeUnitSystem(unitSystem) === "metric" ? number : number * POUNDS_PER_KILOGRAM;
}

export function weightUnit(unitSystem = "us") {
  return normalizeUnitSystem(unitSystem) === "metric" ? "kg" : "lb";
}

export function parseHeightCm(value, unitSystem = "us") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;

  const centimeters = text.match(/^(\d+(?:\.\d+)?)\s*(?:cm|centimeters?|centimetres?)$/);
  if (centimeters) return Number(centimeters[1]);

  const meters = text.match(/^(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)$/);
  if (meters) return Number(meters[1]) * 100;

  const feetAndInches = text.match(/^(\d+)\s*(?:ft|feet|foot|')\s*(\d+(?:\.\d+)?)?\s*(?:in|inches?|\")?$/);
  if (feetAndInches) return (Number(feetAndInches[1]) * 12 + Number(feetAndInches[2] || 0)) * 2.54;

  const inches = text.match(/^(\d+(?:\.\d+)?)\s*(?:in|inches?|\")$/);
  if (inches) return Number(inches[1]) * 2.54;

  const plain = numeric(text);
  if (plain === null) return null;
  return normalizeUnitSystem(unitSystem) === "metric" ? plain : plain * 2.54;
}

export function estimatedAdultBmi({ weightKg, heightCm, age, enabled = true, override = null }) {
  if (!enabled || Number(age) < 20) return null;
  const enteredOverride = numeric(override);
  if (enteredOverride !== null && enteredOverride >= 5 && enteredOverride <= 100) {
    return { value: enteredOverride, source: "entered" };
  }
  const weight = numeric(weightKg);
  const height = numeric(heightCm);
  if (weight === null || height === null || weight <= 0 || height <= 0) return null;
  return { value: weight / ((height / 100) ** 2), source: "estimated" };
}

export function suggestedStartingTargets(answers = {}) {
  const unitSystem = normalizeUnitSystem(answers.unit_system);
  const weightKg = weightToKg(answers.current_weight, unitSystem);
  const heightCm = parseHeightCm(answers.height, unitSystem);
  const age = numeric(answers.age);
  const sex = String(answers.biological_sex || "");
  const goals = Array.isArray(answers.primary_goals) ? answers.primary_goals : [];
  const eatingStyles = Array.isArray(answers.eating_styles) ? answers.eating_styles : [];
  const activityFactors = {
    "Mostly seated": 1.2,
    "Lightly active": 1.35,
    "Active": 1.55,
    "Very active": 1.75
  };

  let calories = 2050;
  let calorieBasis = "general starting point";
  if (weightKg && heightCm && age && age >= 18 && (sex === "Male" || sex === "Female") && activityFactors[answers.activity_level]) {
    const sexAdjustment = sex === "Male" ? 5 : -161;
    const restingEstimate = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + sexAdjustment;
    let calorieEstimate = restingEstimate * activityFactors[answers.activity_level];
    const losing = goals.includes("Lose Weight");
    const gaining = goals.includes("Gain Muscle");
    if (losing && !gaining) calorieEstimate -= 300;
    if (gaining && !losing) calorieEstimate += 250;
    calories = Math.round(Math.min(5000, Math.max(1200, calorieEstimate)) / 50) * 50;
    calorieBasis = "profile-based starting estimate";
  }

  let protein = 130;
  let proteinBasis = "general starting point";
  if (weightKg) {
    let gramsPerKg = 1.2;
    if (goals.includes("Gain Muscle") || eatingStyles.includes("High Protein")) gramsPerKg = 1.5;
    else if (goals.includes("Lose Weight")) gramsPerKg = 1.3;
    protein = Math.round(Math.min(250, Math.max(45, weightKg * gramsPerKg)) / 5) * 5;
    proteinBasis = "weight- and goal-based starting estimate";
  }

  const netCarbs = eatingStyles.includes("Keto") ? 25 : eatingStyles.includes("Low Carb") ? 40 : 130;

  return {
    calorie_goal: { value: calories, unit: "calories/day", basis: calorieBasis },
    protein_goal: { value: protein, unit: "g/day", basis: proteinBasis },
    net_carb_goal: { value: netCarbs, unit: "g/day", basis: eatingStyles.includes("Keto") || eatingStyles.includes("Low Carb") ? "eating-style starting point" : "general starting point" },
    fiber_goal: { value: 30, unit: "g/day", basis: "general starting point" },
    water_goal: { value: 90, unit: "fl oz/day", basis: "general starting point" }
  };
}

export function formatWeight(valueKg, unitSystem = "us", digits = 1) {
  const value = weightFromKg(valueKg, unitSystem);
  if (value === null) return "—";
  return `${value.toFixed(digits).replace(/\.0$/, "")} ${weightUnit(unitSystem)}`;
}

export function formatWeightChange(valueKg, unitSystem = "us") {
  const value = weightFromKg(Math.abs(Number(valueKg || 0)), unitSystem) || 0;
  const sign = Number(valueKg) > 0 ? "+" : Number(valueKg) < 0 ? "−" : "";
  return `${sign}${value.toFixed(1).replace(/\.0$/, "")} ${weightUnit(unitSystem)}`;
}
