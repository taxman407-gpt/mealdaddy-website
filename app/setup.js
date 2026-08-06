import { supabase, requireSession } from "./supabase-client.js";
import { normalizeUnitSystem, suggestedStartingTargets, weightToKg, weightUnit } from "./health-metrics.js?v=20260806-2";

const session = await requireSession();
if (!session) throw new Error("Authentication required");
const user = session.user;
const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const selectedPlan = params.get("plan") === "core" ? "core" : "";

const choices = {
  goals: ["Lose Weight", "Maintain Weight", "Gain Muscle", "Eat Healthier", "Reduce Inflammation", "Better Blood Sugar", "Heart Healthy", "Meal Planning", "Other"],
  sex: ["Male", "Female", "Prefer not to say"],
  units: ["US", "Metric"],
  activity: ["Mostly seated", "Lightly active", "Active", "Very active"],
  eatingStyles: ["Mediterranean", "DASH", "Low Carb", "Keto", "Vegetarian", "Vegan", "High Protein", "Paleo", "Gluten Free", "None"],
  proteins: ["Chicken", "Beef", "Pork", "Fish", "Seafood", "Eggs", "Turkey", "Beans", "Tofu"],
  cuisines: ["Mexican", "Italian", "Asian", "Mediterranean", "BBQ", "Indian", "American", "Other"],
  household: ["Just me", "Me + Partner", "Family", "Other"],
  cooking: ["Almost every day", "A few times a week", "Rarely"],
  dining: ["Daily", "Several times a week", "Weekly", "Rarely"],
  appliances: ["Air Fryer", "Instant Pot", "Slow Cooker", "Grill", "Smoker", "Sous Vide", "Blender", "Food Processor"],
  yesNo: ["Yes", "No"],
  uses: ["Log meals", "Meal planning", "Grocery lists", "Restaurant recommendations", "Weight tracking", "Photo logging", "Recipe ideas", "Hydration tracking", "Weekly reports"],
  detail: ["Just the basics", "Moderate", "Every macro"],
  coaching: ["Friendly", "Encouraging", "Direct", "Detailed", "Short & Simple"],
  reminders: ["Water", "Protein", "Fiber", "Restaurant choices", "Grocery shopping", "Weekly weigh-ins"]
};

const steps = [
  { title: "About you", intro: "The basics help Meal Daddy personalize targets. Optional measurements can be added later.", fields: [
    ["name", "What should I call you?", "text", "First name or nickname", true],
    ["primary_goals", "What are your primary goals?", "multi", choices.goals, true],
    ["age", "Age", "number", "Optional"], ["biological_sex", "Biological sex", "single", choices.sex],
    ["unit_system", "Preferred measurement units", "single", choices.units],
    ["height", "Height", "text", "e.g. 5 ft 10 in or 178 cm"], ["current_weight", "Current weight", "number", "Optional"], ["goal_weight", "Goal weight", "number", "Optional"],
    ["activity_level", "Usual activity level", "single", choices.activity], ["track_bmi", "Show an estimated adult BMI?", "single", choices.yesNo]
  ]},
  { title: "Nutrition", intro: "Enter your own targets or use the starting estimates shown beside them. Nothing here requires an AI request.", fields: [
    ["calorie_goal", "Calories per day", "target", "Optional"], ["protein_goal", "Protein goal", "target", "Optional"],
    ["eating_styles", "Preferred eating style", "multi", choices.eatingStyles],
    ["net_carb_goal", "Daily net-carb ceiling", "target", "Optional"],
    ["fiber_goal", "Daily fiber target", "target", "Optional"], ["water_goal", "Daily hydration target", "target", "Optional"]
  ]},
  { title: "Health", intro: "All health questions are optional.", fields: [
    ["foods_to_avoid", "Foods you must avoid", "textarea", "Allergies, intolerances, religious needs, or personal choices"],
    ["medical_restrictions", "Medical nutrition restrictions", "textarea", "Diabetes, kidney disease, high blood pressure, high cholesterol..."],
    ["relevant_medications", "Medications affecting appetite or digestion", "textarea", "GLP-1, insulin, steroids..."]
  ]},
  { title: "Food preferences", intro: "Quick preferences make suggestions more useful.", fields: [
    ["foods_loved", "Foods you love", "textarea", "Optional"], ["foods_disliked", "Foods you hate", "textarea", "Optional"],
    ["favorite_proteins", "Favorite proteins", "multi", choices.proteins], ["favorite_cuisines", "Favorite cuisines", "multi", choices.cuisines]
  ]},
  { title: "Lifestyle", intro: "Meal Daddy will keep plans realistic for your routine.", fields: [
    ["cooking_for", "Who are you cooking for?", "single", choices.household], ["cook_frequency", "How often do you cook?", "single", choices.cooking],
    ["eat_out_frequency", "How often do you eat out?", "single", choices.dining], ["grocery_budget", "Monthly grocery budget", "number", "Optional"]
  ]},
  { title: "Kitchen", intro: "We'll favor methods and ingredients you already have.", fields: [
    ["appliances", "Which appliances do you have?", "multi", choices.appliances], ["has_garden", "Vegetable or herb garden?", "single", choices.yesNo]
  ]},
  { title: "Tracking", intro: "Choose only what would genuinely help.", fields: [
    ["mealdaddy_uses", "How would you like to use Meal Daddy?", "multi", choices.uses], ["tracking_detail", "How detailed should tracking be?", "single", choices.detail]
  ]},
  { title: "Restaurant intelligence", intro: "Get useful guidance before you order.", fields: [
    ["restaurant_help", "Help before ordering at restaurants?", "single", choices.yesNo], ["favorite_restaurants", "Favorite restaurants", "textarea", "Chains and local restaurants"]
  ]},
  { title: "Coaching", intro: "Set the voice and reminders that work for you.", fields: [
    ["coaching_style", "How should Meal Daddy coach you?", "single", choices.coaching], ["reminders", "Remind me about", "multi", choices.reminders],
    ["biggest_challenge", "What's the biggest challenge keeping you from eating the way you'd like?", "textarea", "Travel, time, cost, pain, evening snacks, not knowing what to cook..."]
  ]}
];

let currentStep = 0;
let answers = JSON.parse(sessionStorage.getItem("mealdaddy-onboarding") || "{}");

function normalizeAnswers() {
  if (answers.primary_goal && !(answers.primary_goals || []).length) {
    answers.primary_goals = [answers.primary_goal];
    delete answers.primary_goal;
  }
  if (!Object.hasOwn(answers, "net_carb_goal")) {
    const eatingStyles = Array.isArray(answers.eating_styles) ? answers.eating_styles : [];
    if (eatingStyles.includes("Keto")) answers.net_carb_goal = "25";
    else if (eatingStyles.includes("Low Carb")) answers.net_carb_goal = "40";
  }
  if (!answers.unit_system) answers.unit_system = "US";
  if (!answers.track_bmi) answers.track_bmi = "No";
}
normalizeAnswers();

document.body.classList.remove("auth-loading");

function escapeHtml(value = "") {
  return String(value).replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[character]);
}

function fieldHtml([name, label, type, options, required]) {
  const value = answers[name] ?? (type === "multi" ? [] : "");
  const requiredMark = required ? '<span class="required-mark">Required</span>' : '<span class="optional-mark">Optional</span>';
  if (type === "target") {
    const suggestion = suggestedStartingTargets(answers)[name];
    return `<div class="setup-target-card"><label class="setup-field"><span>${escapeHtml(label)} ${requiredMark}</span><input name="${name}" type="number" value="${escapeHtml(value)}" placeholder="Enter your own" inputmode="decimal"></label><aside><span>Meal Daddy ${escapeHtml(suggestion.basis)}</span><strong>${escapeHtml(suggestion.value)} ${escapeHtml(suggestion.unit)}</strong><button type="button" data-use-target="${name}" data-target-value="${escapeHtml(suggestion.value)}">Use ${escapeHtml(suggestion.value)} as my starting point</button></aside></div>`;
  }
  if (type === "single" || type === "multi") {
    return `<fieldset class="setup-field"><legend>${escapeHtml(label)} ${required ? requiredMark : ""}</legend><div class="setup-choices">${options.map((option) => {
      const checked = type === "multi" ? value.includes(option) : value === option;
      return `<label class="setup-choice"><input type="${type === "multi" ? "checkbox" : "radio"}" name="${name}" value="${escapeHtml(option)}" ${checked ? "checked" : ""}><span>${escapeHtml(option)}</span></label>`;
    }).join("")}</div></fieldset>`;
  }
  if (type === "textarea") return `<label class="setup-field"><span>${escapeHtml(label)} ${required ? requiredMark : requiredMark.replace("Required", "Optional")}</span><textarea name="${name}" rows="3" placeholder="${escapeHtml(options)}">${escapeHtml(value)}</textarea></label>`;
  const unitLabel = name === "current_weight" || name === "goal_weight" ? ` (${weightUnit(normalizeUnitSystem(answers.unit_system))})` : "";
  return `<label class="setup-field"><span>${escapeHtml(label)}${escapeHtml(unitLabel)} ${required ? requiredMark : requiredMark.replace("Required", "Optional")}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(options)}" ${type === "number" ? 'inputmode="decimal"' : ""}></label>`;
}

function collectVisibleAnswers() {
  const form = new FormData($("#setup-form"));
  for (const field of steps[currentStep]?.fields || []) {
    const [name, , type] = field;
    answers[name] = type === "multi" ? form.getAll(name) : (form.get(name) || "").toString().trim();
  }
  sessionStorage.setItem("mealdaddy-onboarding", JSON.stringify(answers));
}

function renderSummary() {
  const rows = [
    ["Goals", (answers.primary_goals || []).join(", ")], ["Calories", answers.calorie_goal ? `${answers.calorie_goal}/day` : "Not set"],
    ["Protein", answers.protein_goal ? `${answers.protein_goal}g/day` : "Not set"], ["Net-carb ceiling", answers.net_carb_goal ? `${answers.net_carb_goal}g/day` : "Not set"],
    ["Starting weight", answers.current_weight ? `${answers.current_weight} ${weightUnit(normalizeUnitSystem(answers.unit_system))}` : "Not set"], ["BMI", answers.track_bmi === "Yes" ? "Estimated adult BMI enabled" : "Not displayed"],
    ["Eating style", (answers.eating_styles || []).join(", ") || "Flexible"],
    ["Foods to avoid", answers.foods_to_avoid || "None listed"], ["Restaurants", answers.favorite_restaurants || "None listed"],
    ["Garden", answers.has_garden || "Not specified"], ["Tracking", answers.tracking_detail || "Moderate"],
    ["Coaching", answers.coaching_style || "Friendly"], ["Biggest challenge", answers.biggest_challenge || "Not specified"]
  ];
  $("#setup-fields").innerHTML = `<div class="setup-summary">${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
}

function render() {
  const summary = currentStep === steps.length;
  const step = steps[currentStep];
  $("#setup-step-label").textContent = summary ? "Review" : `Section ${currentStep + 1} of ${steps.length}`;
  $("#setup-title").textContent = summary ? "Here's what I learned" : step.title;
  $("#setup-intro").textContent = summary ? "Confirm your starting profile. You can change it anytime." : step.intro;
  $("#setup-progress-bar").style.width = `${((currentStep + 1) / (steps.length + 1)) * 100}%`;
  if (summary) renderSummary(); else $("#setup-fields").innerHTML = step.fields.map(fieldHtml).join("");
  $("#setup-back").disabled = currentStep === 0;
  $("#setup-next").textContent = summary ? "Finish setup" : "Next";
  window.scrollTo({ top: 0, behavior: "instant" });
}

function validateStep() {
  if (currentStep !== 0) return true;
  if (!answers.name || !(answers.primary_goals || []).length) {
    $("#setup-status").textContent = "Add your name and at least one primary goal to continue.";
    return false;
  }
  return true;
}

async function saveStartingWeight() {
  const startingWeightKg = weightToKg(answers.current_weight, answers.unit_system);
  if (!startingWeightKg) return true;
  const { data: existingWeight, error: readError } = await supabase
    .from("weight_entries")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;
  if (existingWeight) return true;
  const { error } = await supabase.from("weight_entries").insert({
    user_id: user.id,
    measured_on: new Date().toISOString().slice(0, 10),
    weight_kg: Math.round(startingWeightKg * 100) / 100,
    source: "setup",
    note: "Starting weight from setup"
  });
  if (error) throw error;
  return true;
}

async function saveProfile(completed) {
  $("#setup-status").textContent = completed ? "Saving your profile..." : "Saving...";
  const toneMap = { Friendly: "supportive", Encouraging: "supportive", Direct: "direct", Detailed: "data_focused", "Short & Simple": "direct" };
  const diet = (answers.eating_styles || [])[0] || "Flexible";
  const payload = {
    user_id: user.id,
    diet_style: diet,
    coaching_tone: toneMap[answers.coaching_style] || "supportive",
    ai_routing_preference: "best_value",
    onboarding_data: answers,
    updated_at: new Date().toISOString(),
    ...(completed ? { onboarding_completed_at: new Date().toISOString() } : {})
  };
  const { error } = await supabase.from("profiles").upsert(payload);
  if (error) { $("#setup-status").textContent = error.message; return false; }
  if (completed) {
    try {
      await saveStartingWeight();
    } catch (weightError) {
      $("#setup-status").textContent = weightError.message;
      return false;
    }
    sessionStorage.removeItem("mealdaddy-onboarding");
  }
  return true;
}

$("#setup-next").addEventListener("click", async () => {
  if (currentStep < steps.length) collectVisibleAnswers();
  if (!validateStep()) return;
  $("#setup-status").textContent = "";
  if (currentStep < steps.length) { currentStep += 1; render(); return; }
  if (await saveProfile(true)) location.replace(`./app.html${selectedPlan ? `?plan=${selectedPlan}` : ""}`);
});

$("#setup-back").addEventListener("click", () => { if (currentStep > 0) { if (currentStep < steps.length) collectVisibleAnswers(); currentStep -= 1; render(); } });
$("#save-exit").addEventListener("click", async () => { if (currentStep < steps.length) collectVisibleAnswers(); if (await saveProfile(false)) location.replace("./app.html"); });

$("#setup-form").addEventListener("click", (event) => {
  const button = event.target.closest("[data-use-target]");
  if (!button) return;
  const field = $("#setup-form").elements.namedItem(button.dataset.useTarget);
  if (!field) return;
  field.value = button.dataset.targetValue;
  answers[button.dataset.useTarget] = button.dataset.targetValue;
  sessionStorage.setItem("mealdaddy-onboarding", JSON.stringify(answers));
  button.textContent = "Starting point selected";
});

$("#setup-form").addEventListener("change", (event) => {
  if (event.target.name === "unit_system") {
    collectVisibleAnswers();
    render();
    return;
  }
  if (event.target.name === "eating_styles") {
    collectVisibleAnswers();
    const suggestions = suggestedStartingTargets(answers);
    $("#setup-form").querySelectorAll("[data-use-target]").forEach((button) => {
      const suggestion = suggestions[button.dataset.useTarget];
      if (!suggestion) return;
      button.dataset.targetValue = suggestion.value;
      button.textContent = `Use ${suggestion.value} as my starting point`;
      const aside = button.closest("aside");
      aside.querySelector("span").textContent = `Meal Daddy ${suggestion.basis}`;
      aside.querySelector("strong").textContent = `${suggestion.value} ${suggestion.unit}`;
    });
  }
});

const { data: existing } = await supabase.from("profiles").select("onboarding_data").eq("user_id", user.id).maybeSingle();
if (existing?.onboarding_data && Object.keys(existing.onboarding_data).length) answers = { ...existing.onboarding_data, ...answers };
normalizeAnswers();
render();
