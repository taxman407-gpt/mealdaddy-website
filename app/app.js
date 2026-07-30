import { supabase, requireSession } from "./supabase-client.js";
import { buildProteinGuidance } from "./feedback-guidance.js?v=20260729-22";

const dietStyles = ["Mediterranean", "Low-carb", "Pescatarian", "DASH", "Vegetarian", "High-protein", "Flexible"];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const session = await requireSession();
if (!session) throw new Error("Authentication required");

const user = session.user;
const allowedPlans = new Set(["core"]);
const mealLabels = new Set(["Breakfast", "Brunch", "Lunch", "Dinner", "Snack"]);
const entryCategories = [...mealLabels, "Hydration"];
const query = new URLSearchParams(location.search);
let pendingPlan = allowedPlans.has(query.get("plan")) ? query.get("plan") : null;
const checkoutResult = query.get("checkout");
const state = { diet: "", tone: "supportive", provider: "best_value", entries: [], photo: null, coachPhoto: null, restaurantLocation: null, coachMode: "dinner", calorieGoal: 2050, proteinGoal: 130, netCarbGoal: 0, fiberGoal: 30, waterGoal: 90, eatingStyles: [], goals: [], trackingDetail: "Moderate", uses: [], reminders: [], favoriteProteins: [], foodsLoved: "", foodsDisliked: "", foodsToAvoid: "", biggestChallenge: "", suggestedProteinTarget: 40, currentTotals: { calories: 0, protein: 0, carbs: 0, netCarbs: 0, fat: 0, fiber: 0, water: 0 } };
const installDismissedKey = "mealdaddy-install-tip-dismissed";
let deferredInstallPrompt = null;
let latestReport = null;
document.body.classList.remove("auth-loading");
$("#account-email").textContent = user.email || "Signed in";
$("#greeting").textContent = `Welcome back${user.user_metadata?.first_name ? `, ${user.user_metadata.first_name}` : ""}.`;
$("#today-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());

function isRunningInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function installTipWasDismissed() {
  try {
    return localStorage.getItem(installDismissedKey) === "true";
  } catch {
    return false;
  }
}

function hideInstallTip(persist = false) {
  if (persist) {
    try {
      localStorage.setItem(installDismissedKey, "true");
    } catch {
      // The tip still hides for this page when device storage is unavailable.
    }
  }
  $("#install-tip").hidden = true;
}

function browserInstallInstructions() {
  const agent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(agent)) {
    return "In Safari, tap Share, then Add to Home Screen. No app store needed.";
  }
  if (agent.includes("android") && agent.includes("chrome")) {
    return "In Chrome, tap the three dots, then Install app or Add to Home Screen. No app store needed.";
  }
  return "Use your browser’s menu and choose Install app or Add to Home Screen. No app store needed.";
}

if (isRunningInstalled() || installTipWasDismissed()) {
  hideInstallTip();
} else {
  $("#install-tip-instructions").textContent = browserInstallInstructions();
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("#install-app").hidden = false;
  $("#install-tip").hidden = false;
  $("#install-tip-instructions").textContent = "Your browser can install Meal Daddy now for faster access.";
});

$("#install-app").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  await deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("#install-app").hidden = true;
  if (choice.outcome === "accepted") hideInstallTip();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  hideInstallTip();
});

$("#dismiss-install-tip").addEventListener("click", () => hideInstallTip(true));

function defaultMealLabel(date = new Date()) {
  const hour = date.getHours();
  if (hour < 10) return "Breakfast";
  if (hour < 12) return "Brunch";
  if (hour < 16) return "Lunch";
  if (hour < 21) return "Dinner";
  return "Snack";
}

function hydrationOunces(description) {
  const match = description.match(/(\d+(?:\.\d+)?)\s*(fluid\s*ounces?|fl\s*oz|ounces?|oz|cups?|milliliters?|ml|liters?|litres?|l)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase().replace(/\s+/g, "");
  let ounces = amount;
  if (unit.startsWith("cup")) ounces = amount * 8;
  if (unit === "ml" || unit.startsWith("milliliter")) ounces = amount / 29.5735;
  if (unit === "l" || unit.startsWith("liter") || unit.startsWith("litre")) ounces = amount * 33.814;
  return Math.round(ounces * 10) / 10;
}

function isHydrationDescription(description) {
  return hydrationOunces(description) !== null && /\b(water|hydration|hydrate|fluid|fluids)\b/i.test(description);
}

function hydrationNeedsNutritionEstimate(description) {
  return /\b(cream|creamer|milk|half[\s-]?and[\s-]?half|sugar|honey|syrup|sweeten(?:ed|er)?|juice|smoothie|shake|protein|soda|pop|sports drink|energy drink|beer|wine|cocktail|liquor)\b/i.test(description);
}

$("#meal-label").value = defaultMealLabel();

function escapeHtml(value = "") {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("is-visible"), 3200);
}

async function startCheckout(plan) {
  if (!allowedPlans.has(plan)) return;
  const buttons = document.querySelectorAll("[data-plan]");
  const status = $("#billing-status");
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = "Opening secure Stripe Checkout...";
  try {
    const { data, error } = await supabase.functions.invoke("create-checkout", { body: { plan } });
    if (error) throw error;
    if (!data?.url || new URL(data.url).hostname !== "checkout.stripe.com") {
      throw new Error(data?.error || "Stripe Checkout did not return a valid address.");
    }
    pendingPlan = null;
    location.assign(data.url);
  } catch (error) {
    status.textContent = "Checkout could not be opened. Please try again.";
    toast(error.message || "Checkout could not be opened.");
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function renderDietChoices() {
  $("#diet-options").innerHTML = dietStyles.map((diet) => `<button class="choice-chip ${state.diet === diet ? "is-selected" : ""}" type="button" data-diet="${diet}" aria-pressed="${state.diet === diet}">${diet}</button>`).join("");
}

function showOnboarding() {
  location.assign(`./setup.html${pendingPlan ? `?plan=${pendingPlan}` : ""}`);
}

function closeOnboarding() {
  $("#onboarding").hidden = true;
  document.body.classList.remove("modal-open");
}

async function loadProfile() {
  const { data, error } = await supabase.from("profiles").select("diet_style,coaching_tone,ai_routing_preference,onboarding_data,onboarding_completed_at").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data?.onboarding_completed_at) {
    showOnboarding();
    return;
  }
  state.diet = data.diet_style;
  state.tone = data.coaching_tone;
  state.provider = data.ai_routing_preference || "best_value";
  const profile = data.onboarding_data || {};
  if (profile.name) $("#greeting").textContent = `Welcome back, ${profile.name}.`;
  const goals = profile.primary_goals || (profile.primary_goal ? [profile.primary_goal] : []);
  state.goals = Array.isArray(goals) ? goals : [];
  state.eatingStyles = Array.isArray(profile.eating_styles) ? profile.eating_styles : [];
  state.trackingDetail = profile.tracking_detail || "Moderate";
  state.uses = Array.isArray(profile.mealdaddy_uses) ? profile.mealdaddy_uses : [];
  state.reminders = Array.isArray(profile.reminders) ? profile.reminders : [];
  state.favoriteProteins = Array.isArray(profile.favorite_proteins) ? profile.favorite_proteins : [];
  state.foodsLoved = profile.foods_loved || "";
  state.foodsDisliked = profile.foods_disliked || "";
  state.foodsToAvoid = profile.foods_to_avoid || "";
  state.biggestChallenge = profile.biggest_challenge || "";
  const normalizedStyles = [state.diet, ...state.eatingStyles].map((value) => String(value || "").toLowerCase().replaceAll("-", " "));
  const defaultNetCarbGoal = normalizedStyles.some((value) => value.includes("keto"))
    ? 25
    : normalizedStyles.some((value) => value.includes("low carb"))
      ? 40
      : 0;
  state.netCarbGoal = Object.hasOwn(profile, "net_carb_goal")
    ? Math.max(0, Number(profile.net_carb_goal) || 0)
    : defaultNetCarbGoal;
  if (state.goals.length) $("#goal-summary").textContent = `Today's focus: ${state.goals.join(" · ")}`;
  const calorieGoal = Number(profile.calorie_goal || 2050);
  const proteinGoal = Number(profile.protein_goal || 130);
  state.calorieGoal = calorieGoal;
  state.proteinGoal = proteinGoal;
  $("#energy-progress").max = calorieGoal;
  $("#protein-progress").max = proteinGoal;
  $("#energy-goal-label").textContent = `of ${calorieGoal.toLocaleString()} cal`;
  $("#protein-goal-label").textContent = `of ${proteinGoal}g`;
  $("#carbs-goal-label").textContent = state.netCarbGoal
    ? `${state.netCarbGoal}g net daily ceiling`
    : "estimated total/net";
  $("#profile-diet").textContent = state.diet;
  $("#tone-options").value = state.tone;
  renderCoachFeedback();
  const provider = document.querySelector(`input[name="provider"][value="${state.provider}"]`);
  if (provider) provider.checked = true;
}

async function loadMembership() {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_key,status,trial_ends_at,current_period_ends_at,cancel_at_period_end")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    $("#subscription").hidden = checkoutResult === "success";
    return;
  }

  const membershipIsCurrent = ["trialing", "active", "past_due"].includes(data.status);
  if (!membershipIsCurrent) {
    $("#subscription").hidden = false;
    return;
  }

  const planName = data.plan_key === "byo" ? "Bring Your Own API" : "Meal Daddy Core";
  $("#subscription").hidden = true;
  $("#plan-options").hidden = true;
  $("#trial-note").hidden = true;
  $("#subscription-title").textContent = planName;
  $("#provider-settings").hidden = data.plan_key !== "byo";

  if (data.status === "trialing" && data.trial_ends_at) {
    const trialEnd = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(new Date(data.trial_ends_at));
    $("#subscription-copy").textContent = `Your 7-day trial is active through ${trialEnd}. After that, your monthly membership begins unless cancelled.`;
    $("#billing-status").textContent = "Trial active";
  } else {
    $("#subscription-copy").textContent = data.cancel_at_period_end
      ? "Your membership remains available through the end of the current billing period."
      : "Your membership is active.";
    $("#billing-status").textContent = data.cancel_at_period_end ? "Cancellation scheduled" : "Membership active";
  }
}

async function loadLedger() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase.from("ledger_entries").select("id,kind,occurred_at,description,meal_label,nutrition_estimate,status").gte("occurred_at", start.toISOString()).order("occurred_at", { ascending: false });
  if (error) throw error;
  state.entries = data || [];
  renderLedger();
  renderTotals();
}

function renderLedger() {
  if (!state.entries.length) {
    $("#ledger-list").innerHTML = '<li class="ledger-empty">Nothing logged yet. Your first entry takes only a few seconds.</li>';
    return;
  }
  $("#ledger-list").innerHTML = state.entries.map((entry) => {
    const estimate = entry.nutrition_estimate || {};
    const mealHydration = Number(estimate.hydration_ounces || 0);
    const meta = entry.kind === "hydration"
      ? `${estimate.ounces || 0} fl oz${Number(estimate.calories || 0) > 0 ? ` · ${Math.round(estimate.calories)} cal` : entry.status === "pending_estimate" ? " · Estimate pending" : ""}`
      : entry.status === "pending_estimate" ? "Estimate pending" : `${estimate.calories || 0} cal${mealHydration > 0 ? ` · ${Math.round(mealHydration)} fl oz` : ""}`;
    const label = entry.kind === "hydration" ? "Hydration" : mealLabels.has(entry.meal_label) ? entry.meal_label : "Meal";
    const ledgerIcon = entry.kind === "hydration" ? "H" : mealLabels.has(entry.meal_label) ? entry.meal_label.charAt(0) : "M";
    const currentCategory = entry.kind === "hydration" ? "Hydration" : mealLabels.has(entry.meal_label) ? entry.meal_label : defaultMealLabel(new Date(entry.occurred_at));
    const edit = `<button class="ledger-edit-button" type="button" data-edit-entry="${entry.id}" aria-label="Edit ${escapeHtml(label)}">Edit</button>`;
    const editor = `<form class="ledger-edit-form" data-edit-form="${entry.id}" hidden>
          <label><span>Log as</span><select name="entry_category">${entryCategories.map((option) => `<option${option === currentCategory ? " selected" : ""}>${option}</option>`).join("")}</select></label>
          <label><span>Description</span><input name="description" value="${escapeHtml(entry.description)}" required maxlength="1200" /></label>
          <div><button class="button button-primary" type="submit">Save</button><button class="button button-quiet" type="button" data-cancel-edit="${entry.id}">Cancel</button><button class="button button-delete-entry" type="button" data-delete-entry="${entry.id}">Delete entry</button></div>
        </form>`;
    return `<li class="ledger-item">
      <span class="ledger-icon" aria-hidden="true">${ledgerIcon}</span>
      <span class="ledger-main"><strong>${escapeHtml(entry.description)}</strong></span>
      <span class="ledger-actions"><small>${meta}</small>${edit}</span>
      ${editor}
    </li>`;
  }).join("");
}

function renderTotals() {
  const totals = state.entries.reduce((sum, entry) => {
    const n = entry.nutrition_estimate || {};
    sum.calories += Number(n.calories || 0);
    sum.protein += Number(n.protein_g || 0);
    sum.carbs += Number(n.carbs_g || 0);
    sum.netCarbs += typeof n.net_carbs_g === "number"
      ? Number(n.net_carbs_g)
      : Math.max(0, Number(n.carbs_g || 0) - Number(n.fiber_g || 0));
    sum.fat += Number(n.fat_g || 0);
    sum.fiber += Number(n.fiber_g || 0);
    sum.water += entry.kind === "hydration" ? Number(n.ounces || 0) : Number(n.hydration_ounces || 0);
    return sum;
  }, { calories: 0, protein: 0, carbs: 0, netCarbs: 0, fat: 0, fiber: 0, water: 0 });
  $("#energy-total").textContent = Math.round(totals.calories).toLocaleString();
  $("#protein-total").textContent = `${Math.round(totals.protein)}g`;
  $("#carbs-total").textContent = `${Math.round(totals.carbs)}g/${Math.round(totals.netCarbs)}g`;
  $("#fat-total").textContent = `${Math.round(totals.fat)}g`;
  $("#fiber-total").textContent = `${Math.round(totals.fiber)}g`;
  $("#water-total").textContent = `${Math.round(totals.water)}oz`;
  $("#energy-progress").value = totals.calories; $("#protein-progress").value = totals.protein; $("#fiber-progress").value = totals.fiber; $("#water-progress").value = totals.water;
  renderCoachFeedback(totals);
}

async function loadFeedback() {
  const { data, error } = await supabase
    .from("customer_feedback")
    .select("rating,comment,public_display_consent")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  const rating = document.querySelector(`input[name="rating"][value="${data.rating}"]`);
  if (rating) rating.checked = true;
  $("#feedback-comment").value = data.comment || "";
  $("#feedback-public-consent").checked = Boolean(data.public_display_consent);
  $("#feedback-status").textContent = "Your previous feedback is loaded.";
}

function renderCoachFeedback(providedTotals) {
  const totals = providedTotals || state.entries.reduce((sum, entry) => {
    const nutrition = entry.nutrition_estimate || {};
    sum.calories += Number(nutrition.calories || 0);
    sum.protein += Number(nutrition.protein_g || 0);
    sum.carbs += Number(nutrition.carbs_g || 0);
    sum.netCarbs += typeof nutrition.net_carbs_g === "number"
      ? Number(nutrition.net_carbs_g)
      : Math.max(0, Number(nutrition.carbs_g || 0) - Number(nutrition.fiber_g || 0));
    sum.fat += Number(nutrition.fat_g || 0);
    sum.fiber += Number(nutrition.fiber_g || 0);
    sum.water += entry.kind === "hydration" ? Number(nutrition.ounces || 0) : Number(nutrition.hydration_ounces || 0);
    return sum;
  }, { calories: 0, protein: 0, carbs: 0, netCarbs: 0, fat: 0, fiber: 0, water: 0 });
  state.currentTotals = totals;
  const title = $("#coach-feedback-title");
  const support = $("#coach-feedback-support");
  const suggestion = $("#coach-feedback-suggestion");
  const personalizeButton = $("#personalize-feedback");
  if (!title || !support || !suggestion || !personalizeButton) return;
  personalizeButton.hidden = true;

  const pending = state.entries.some((entry) => entry.status === "pending_estimate");
  if (!state.entries.length) {
    title.textContent = "Ready when you are.";
    support.textContent = "No pressure to make today perfect. Log your next meal or drink and we’ll take it one choice at a time.";
    suggestion.textContent = "Start with what you actually had—close enough is good enough.";
    return;
  }
  if (pending) {
    title.textContent = "Nice work logging it.";
    support.textContent = "Your entry is saved. I’m finishing the nutrition estimate so your totals and guidance stay useful.";
    suggestion.textContent = "You can keep logging while the estimate finishes.";
    return;
  }

  const caloriePercent = totals.calories / Math.max(state.calorieGoal, 1);
  const proteinPercent = totals.protein / Math.max(state.proteinGoal, 1);
  const fiberPercent = totals.fiber / state.fiberGoal;
  const waterPercent = totals.water / state.waterGoal;
  const preferences = new Set(
    [state.diet, ...state.eatingStyles, ...state.goals]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase().replaceAll("-", " ").trim())
  );
  const carbFocus = ["low carb", "keto", "better blood sugar"].some((value) => preferences.has(value));
  const everyMacro = state.trackingDetail === "Every macro";
  const basicsOnly = state.trackingDetail === "Just the basics";
  const fiberFocus = !basicsOnly || ["mediterranean", "dash", "vegetarian", "vegan", "reduce inflammation", "better blood sugar", "heart healthy"].some((value) => preferences.has(value));
  const hydrationFocus = !basicsOnly || totals.water > 0 || state.uses.includes("Hydration tracking") || state.reminders.includes("Water");
  const preferenceLabel = preferences.has("keto") ? "keto" : preferences.has("better blood sugar") && !preferences.has("low carb") ? "blood-sugar-aware" : "low-carb";
  const supportiveOpeners = {
    supportive: "You’re building awareness, and that matters.",
    direct: "Here’s where today stands.",
    data_focused: "Your daily totals are taking shape.",
    playful: "You’re on the board—nice work."
  };
  title.textContent = supportiveOpeners[state.tone] || supportiveOpeners.supportive;
  const summaryMetrics = [
    `${Math.round(totals.calories).toLocaleString()} calories`,
    `${Math.round(totals.protein)}g protein`
  ];
  if (carbFocus || everyMacro) summaryMetrics.push(`${Math.round(totals.carbs)}g total/${Math.round(totals.netCarbs)}g net carbs`);
  if (everyMacro || preferences.has("keto")) summaryMetrics.push(`${Math.round(totals.fat)}g fat`);
  if (fiberFocus) summaryMetrics.push(`${Math.round(totals.fiber)}g fiber`);
  if (hydrationFocus) summaryMetrics.push(`${Math.round(totals.water)} oz hydration`);
  support.textContent = `So far: ${new Intl.ListFormat(undefined, { style: "long", type: "conjunction" }).format(summaryMetrics)}.`;
  const roundedNetCarbs = Math.round(totals.netCarbs);
  const netCarbRemaining = state.netCarbGoal
    ? Math.max(0, Math.round(state.netCarbGoal - totals.netCarbs))
    : null;
  const netCarbGuardrail = state.netCarbGoal
    ? roundedNetCarbs >= state.netCarbGoal
      ? `You’re at about ${roundedNetCarbs}g net carbs against your ${state.netCarbGoal}g daily ceiling. For the rest of today, choose options with as close to zero additional net carbs as practical.`
      : `You have about ${netCarbRemaining}g net carbs left before your ${state.netCarbGoal}g daily ceiling, so keep the next choice within that allowance.`
    : "";

  if (caloriePercent >= 1.1) {
    suggestion.textContent = "You’re above your calorie target, but one day is information—not failure. Favor water and a satisfying protein-and-produce choice if you’re hungry.";
  } else if (waterPercent < 0.35 && new Date().getHours() >= 12) {
    suggestion.textContent = "Hydration is the clearest opportunity right now. Have 12–16 oz of water with your next meal or break.";
  } else if (proteinPercent + 0.15 < caloriePercent) {
    const remaining = Math.max(0, Math.round(state.proteinGoal - totals.protein));
    state.suggestedProteinTarget = Math.min(40, Math.max(20, remaining));
    const proteinGuidance = buildProteinGuidance({
      targetProtein: state.suggestedProteinTarget,
      favoriteProteins: state.favoriteProteins,
      foodsLoved: state.foodsLoved,
      foodsDisliked: state.foodsDisliked,
      foodsToAvoid: state.foodsToAvoid,
      diet: state.diet,
      eatingStyles: state.eatingStyles,
      goals: state.goals,
      biggestChallenge: state.biggestChallenge
    });
    suggestion.textContent = `Protein is trailing your overall intake. ${proteinGuidance.text}`;
    personalizeButton.hidden = false;
  } else if (fiberPercent < 0.5 && caloriePercent >= 0.4) {
    suggestion.textContent = carbFocus
      ? `Fiber could use some support. Choose a ${preferenceLabel} source such as leafy greens, avocado, chia, or flax.`
      : "Fiber could use some support. Add a vegetable, beans, berries, or a whole grain to the next thing you eat.";
  } else if (proteinPercent >= 0.8 && waterPercent >= 0.7) {
    suggestion.textContent = "Protein and hydration are both in a strong place. Keep your next choice simple and guided by hunger.";
  } else if (carbFocus) {
    suggestion.textContent = `For your ${preferenceLabel} preference, keep the next meal centered on a protein you enjoy and non-starchy vegetables.`;
  } else {
    suggestion.textContent = "Keep the next meal balanced: a protein you enjoy, something colorful, and a portion that feels satisfying.";
  }
  if (netCarbGuardrail) suggestion.textContent += ` ${netCarbGuardrail}`;
}

const reportPeriods = {
  daily: { label: "Daily", days: 1 },
  weekly: { label: "Weekly", days: 7 },
  monthly: { label: "Monthly", days: 30 },
  annual: { label: "Annual", days: 365 }
};

function reportDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function reportRange(period) {
  const settings = reportPeriods[period];
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (settings.days - 1));
  start.setHours(0, 0, 0, 0);
  return { ...settings, start, end };
}

async function loadReportEntries(start, end) {
  const entries = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("id,kind,occurred_at,nutrition_estimate,status")
      .gte("occurred_at", start.toISOString())
      .lte("occurred_at", end.toISOString())
      .order("occurred_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    entries.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return entries;
}

function summarizeReport(entries) {
  const totals = entries.reduce((sum, entry) => {
    const nutrition = entry.nutrition_estimate || {};
    sum.calories += Number(nutrition.calories || 0);
    sum.protein += Number(nutrition.protein_g || 0);
    sum.carbs += Number(nutrition.carbs_g || 0);
    sum.netCarbs += typeof nutrition.net_carbs_g === "number"
      ? Number(nutrition.net_carbs_g)
      : Math.max(0, Number(nutrition.carbs_g || 0) - Number(nutrition.fiber_g || 0));
    sum.fat += Number(nutrition.fat_g || 0);
    sum.fiber += Number(nutrition.fiber_g || 0);
    sum.water += entry.kind === "hydration" ? Number(nutrition.ounces || 0) : Number(nutrition.hydration_ounces || 0);
    if (entry.kind === "meal") sum.meals += 1;
    if (entry.kind === "hydration") sum.hydrationEntries += 1;
    return sum;
  }, { calories: 0, protein: 0, carbs: 0, netCarbs: 0, fat: 0, fiber: 0, water: 0, meals: 0, hydrationEntries: 0 });
  const loggedDays = new Set(entries.map((entry) => reportDateKey(entry.occurred_at))).size;
  return { totals, loggedDays };
}

function renderReport(period, range, entries) {
  const { totals, loggedDays } = summarizeReport(entries);
  const divisor = period === "daily" ? 1 : Math.max(1, loggedDays);
  const averageLabel = period === "daily" ? "" : " average/logged day";
  const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  const rangeLabel = period === "daily"
    ? dateFormat.format(range.start)
    : `${dateFormat.format(range.start)}–${dateFormat.format(range.end)}`;
  const metrics = [
    ["Entries", entries.length.toLocaleString()],
    ["Days logged", loggedDays.toLocaleString()],
    [`Calories${averageLabel}`, Math.round(totals.calories / divisor).toLocaleString()],
    [`Protein${averageLabel}`, `${Math.round(totals.protein / divisor)}g`],
    [`Total/net carbs${averageLabel}`, `${Math.round(totals.carbs / divisor)}g/${Math.round(totals.netCarbs / divisor)}g`],
    [`Fat${averageLabel}`, `${Math.round(totals.fat / divisor)}g`],
    [`Fiber${averageLabel}`, `${Math.round(totals.fiber / divisor)}g`],
    [`Hydration${averageLabel}`, `${Math.round(totals.water / divisor)}oz`]
  ];
  $("#report-range").textContent = rangeLabel;
  $("#report-period-title").textContent = `${range.label} report`;
  $("#report-metrics").innerHTML = metrics.map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("");
  $("#report-output").hidden = false;
  $("#report-status").textContent = entries.length
    ? `${range.label} report generated from ${entries.length.toLocaleString()} protected ledger ${entries.length === 1 ? "entry" : "entries"}.`
    : `No ledger entries were found for this ${range.label.toLowerCase()} period.`;
  latestReport = { period, range, metrics, entries: entries.length, loggedDays };
}

async function generateReport(period, button) {
  const range = reportRange(period);
  const buttons = $$("[data-report-period]");
  buttons.forEach((item) => { item.disabled = true; item.classList.toggle("is-active", item === button); });
  $("#report-status").textContent = `Generating ${range.label.toLowerCase()} report...`;
  try {
    const entries = await loadReportEntries(range.start, range.end);
    renderReport(period, range, entries);
  } catch (error) {
    $("#report-status").textContent = "The report could not be generated.";
    toast(error.message || "The report could not be generated.");
  } finally {
    buttons.forEach((item) => { item.disabled = false; });
  }
}

$$("[data-report-period]").forEach((button) => button.addEventListener("click", () => generateReport(button.dataset.reportPeriod, button)));

$("#download-report").addEventListener("click", () => {
  if (!latestReport) return;
  const dateFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
  const lines = [
    `Meal Daddy ${latestReport.range.label} report`,
    `${dateFormat.format(latestReport.range.start)} to ${dateFormat.format(latestReport.range.end)}`,
    "",
    ...latestReport.metrics.map(([label, value]) => `${label}: ${value}`),
    "",
    "Nutrition values are estimates. This report was generated in your browser from your protected Meal Daddy ledger."
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `meal-daddy-${latestReport.period}-report.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("#print-report").addEventListener("click", () => {
  if (latestReport) window.print();
});

$("#diet-options").addEventListener("click", (event) => {
  const choice = event.target.closest("[data-diet]");
  if (!choice) return;
  state.diet = choice.dataset.diet;
  renderDietChoices();
  $("#continue-onboarding").disabled = false;
});

$("#tone-options").addEventListener("change", (event) => { state.tone = event.target.value; });
$("#continue-onboarding").addEventListener("click", async () => {
  const button = $("#continue-onboarding"); button.disabled = true;
  const { error } = await supabase.from("profiles").upsert({ user_id: user.id, diet_style: state.diet, coaching_tone: state.tone, ai_routing_preference: state.provider, updated_at: new Date().toISOString() });
  if (error) { toast(error.message); button.disabled = false; return; }
  $("#profile-diet").textContent = state.diet; closeOnboarding(); toast(`Your ${state.diet} plan is saved.`);
  if (pendingPlan) await startCheckout(pendingPlan);
});
$("#profile-diet").addEventListener("click", showOnboarding);

$$("[data-entry-mode]").forEach((button) => button.addEventListener("click", () => {
  $$("[data-entry-mode]").forEach((item) => item.classList.remove("is-active")); button.classList.add("is-active");
  const mode = button.dataset.entryMode; const input = $("#quick-entry");
  if (mode === "voice") startVoiceCapture();
  input.placeholder = mode === "photo" ? "Add any detail the photo may not show" : "e.g. turkey sandwich, apple, and sparkling water";
  input.focus();
}));

function startVoiceCapture() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { toast("Voice entry is not supported in this browser. You can type instead."); return; }
  const recognition = new SpeechRecognition(); recognition.lang = "en-US"; recognition.interimResults = false;
  recognition.onresult = (event) => { $("#quick-entry").value = event.results[0][0].transcript; };
  recognition.onerror = () => toast("Voice entry could not start. You can type instead.");
  recognition.start(); toast("Listening...");
}

$("#photo-input").addEventListener("change", (event) => { state.photo = event.target.files[0] || null; if (state.photo) toast("Photo ready for private upload."); });

function clearCoachPhoto() {
  state.coachPhoto = null;
  $("#coach-photo-input").value = "";
  $("#coach-photo-name").textContent = "No photo selected.";
}

function clearRestaurantLocation() {
  state.restaurantLocation = null;
  $("#restaurant-location-status").textContent = "Location not shared.";
  $("#use-restaurant-location").textContent = "Use my current area";
  $("#clear-restaurant-location").hidden = true;
}

$("#use-restaurant-location").addEventListener("click", () => {
  const button = $("#use-restaurant-location");
  const status = $("#restaurant-location-status");
  if (!navigator.geolocation) {
    status.textContent = "Location is not supported in this browser. Enter a city or restaurant in the box instead.";
    return;
  }
  button.disabled = true;
  status.textContent = "Waiting for your browser’s location permission...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const accuracyMeters = Math.max(0, Math.round(Number(position.coords.accuracy) || 0));
      state.restaurantLocation = {
        latitude: Number(position.coords.latitude.toFixed(2)),
        longitude: Number(position.coords.longitude.toFixed(2)),
        accuracyMeters,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      };
      const areaAccuracy = accuracyMeters > 0
        ? ` Device accuracy was about ${accuracyMeters < 1000 ? `${accuracyMeters} meters` : `${Math.ceil(accuracyMeters / 1000)} km`}.`
        : "";
      status.textContent = `Current area ready for this request.${areaAccuracy}`;
      button.textContent = "Update current area";
      $("#clear-restaurant-location").hidden = false;
      button.disabled = false;
    },
    (error) => {
      const messages = {
        1: "Location was not shared. You can enter a city or restaurant in the box instead.",
        2: "Your current area could not be determined. Try again or enter a city manually.",
        3: "Location took too long. Try again or enter a city manually."
      };
      status.textContent = messages[error.code] || "Location could not be used. Enter a city manually.";
      button.disabled = false;
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
  );
});

$("#clear-restaurant-location").addEventListener("click", clearRestaurantLocation);

$("#coach-photo-input").addEventListener("change", (event) => {
  const file = event.target.files[0] || null;
  const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (file && (!supportedTypes.has(file.type) || file.size > 8 * 1024 * 1024)) {
    clearCoachPhoto();
    toast("Use a JPG, PNG, WebP, or GIF photo no larger than 8 MB.");
    return;
  }
  state.coachPhoto = file;
  $("#coach-photo-name").textContent = file ? `${file.name} ready` : "No photo selected.";
  if (file) toast("Fridge or pantry photo ready for private analysis.");
});

function openCoachAction(mode) {
  state.coachMode = mode;
  const restaurantMode = mode === "restaurant";
  if (restaurantMode) clearCoachPhoto(); else clearRestaurantLocation();
  $("#coach-action-title").textContent = restaurantMode ? "Restaurant Mode" : "Plan Your Next Meal";
  $("#coach-action-prompt").textContent = restaurantMode
    ? "Enter a restaurant, menu item, or what you are considering ordering."
    : "Describe what you have, or add a fridge or pantry photo. Include your available time or what sounds good.";
  $("#coach-action-context").placeholder = restaurantMode
    ? "e.g. Texas Roadhouse — choosing between sirloin and grilled salmon"
    : "e.g. 30 minutes, cooking for two, something low carb";
  $("#coach-photo-field").hidden = restaurantMode;
  $("#restaurant-location-field").hidden = !restaurantMode;
  $("#run-coach-action").textContent = restaurantMode ? "Get ordering guidance" : "Plan my meal";
  $("#coach-action-form").hidden = false;
  $("#coach-action-status").hidden = true;
  $("#coach-action-result").hidden = true;
  $("#coach-action-context").focus();
}

$("#plan-dinner").addEventListener("click", () => openCoachAction("dinner"));
$("#restaurant-mode").addEventListener("click", () => openCoachAction("restaurant"));
$("#personalize-feedback").addEventListener("click", () => {
  openCoachAction("dinner");
  const carbConstraint = state.netCarbGoal
    ? `My saved daily ceiling is ${state.netCarbGoal}g net carbs. I have already logged about ${Math.round(state.currentTotals.netCarbs)}g today, leaving about ${Math.max(0, Math.round(state.netCarbGoal - state.currentTotals.netCarbs))}g. Treat that as a hard limit whenever possible.`
    : "";
  $("#coach-action-context").value = `${carbConstraint} Help me choose a practical next meal or snack with about ${state.suggestedProteinTarget}g protein. Start with my saved favorite proteins, foods I love, foods I dislike, foods I must avoid, eating style, and biggest challenge. Give me two or three concrete choices with portions. Estimate net carbs for each choice and show my projected daily net carbs when I have a saved ceiling. Do not recommend an option that would exceed it when a lower-carb option exists. If my saved profile is not enough, ask me one short question instead of making a generic recommendation.`.trim();
  $("#coach-action-form").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#coach-action-context").focus();
});
$("#close-coach-action").addEventListener("click", () => {
  $("#coach-action-form").hidden = true;
  clearCoachPhoto();
  clearRestaurantLocation();
});

$("#coach-action-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const enteredContext = $("#coach-action-context").value.trim();
  if (state.coachMode === "restaurant" && !enteredContext) {
    toast("Enter a restaurant, type of food, or what you want help ordering.");
    return;
  }
  if (!enteredContext && !state.coachPhoto) {
    toast("Add a few details or a fridge or pantry photo so Meal Daddy can help.");
    return;
  }
  const context = enteredContext || "Use my fridge or pantry photo to suggest my next meal.";
  const button = $("#run-coach-action");
  const status = $("#coach-action-status");
  const result = $("#coach-action-result");
  button.disabled = true;
  status.textContent = state.coachMode === "restaurant"
    ? "Reviewing your options..."
    : state.coachPhoto
      ? "Reviewing your photo and building a practical meal..."
      : "Building a practical meal...";
  status.hidden = false;
  result.hidden = true;
  let photoPath = "";
  try {
    if (state.coachMode === "dinner" && state.coachPhoto) {
      const safeName = state.coachPhoto.name.replace(/[^a-z0-9._-]/gi, "-");
      photoPath = `${user.id}/coach-${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("meal-photos")
        .upload(photoPath, state.coachPhoto, { upsert: false });
      if (uploadError) {
        status.textContent = `Photo was not uploaded: ${uploadError.message}`;
        return;
      }
    }
    const { data, error } = await supabase.functions.invoke("coach-action", {
      body: {
        mode: state.coachMode,
        context,
        photoPath,
        location: state.coachMode === "restaurant" ? state.restaurantLocation : null,
        nutritionContext: {
          calories: Math.round(state.currentTotals.calories),
          protein: Math.round(state.currentTotals.protein),
          totalCarbs: Math.round(state.currentTotals.carbs),
          netCarbs: Math.round(state.currentTotals.netCarbs),
          netCarbGoal: state.netCarbGoal || null
        }
      }
    });
    if (error || !data?.guidance) {
      status.textContent = data?.error || error?.message || "Meal Daddy could not generate guidance right now.";
      return;
    }
    status.hidden = true;
    result.textContent = data.guidance;
    result.hidden = false;
    clearCoachPhoto();
    clearRestaurantLocation();
  } catch (error) {
    status.textContent = error?.message || "Meal Daddy could not generate guidance right now.";
  } finally {
    if (photoPath) {
      const { error: removeError } = await supabase.storage.from("meal-photos").remove([photoPath]);
      if (removeError) console.warn("Temporary coach photo cleanup failed.", removeError);
    }
    button.disabled = false;
  }
});

$("#ledger-list").addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-entry]");
  const cancelButton = event.target.closest("[data-cancel-edit]");
  const deleteButton = event.target.closest("[data-delete-entry]");
  if (editButton) {
    $(`[data-edit-form="${editButton.dataset.editEntry}"]`).hidden = false;
    editButton.hidden = true;
  }
  if (cancelButton) {
    $(`[data-edit-form="${cancelButton.dataset.cancelEdit}"]`).hidden = true;
    $(`[data-edit-entry="${cancelButton.dataset.cancelEdit}"]`).hidden = false;
  }
  if (deleteButton) {
    const entry = state.entries.find((item) => item.id === deleteButton.dataset.deleteEntry);
    if (!entry || !window.confirm(`Delete “${entry.description}”? This removes it from your history and cannot be undone.`)) return;
    deleteButton.disabled = true;
    deleteButton.textContent = "Deleting...";
    const { data, error } = await supabase
      .from("ledger_entries")
      .delete()
      .eq("id", entry.id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      toast(error?.message || "The entry could not be deleted.");
      deleteButton.disabled = false;
      deleteButton.textContent = "Delete entry";
      return;
    }
    const photoPath = entry.nutrition_estimate?.photo_path;
    if (
      typeof photoPath === "string" &&
      photoPath.startsWith(`${user.id}/`) &&
      !photoPath.includes("..")
    ) {
      const { error: photoError } = await supabase.storage.from("meal-photos").remove([photoPath]);
      if (photoError) console.warn("Deleted entry photo cleanup failed.", photoError);
    }
    await loadLedger();
    toast("Entry deleted. You can log it again whenever you’re ready.");
  }
});

$("#ledger-list").addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-edit-form]");
  if (!form) return;
  event.preventDefault();
  const entry = state.entries.find((item) => item.id === form.dataset.editForm);
  if (!entry) return;
  const formData = new FormData(form);
  const description = String(formData.get("description") || "").trim();
  const category = String(formData.get("entry_category") || "");
  if (!description || !entryCategories.includes(category)) {
    toast("Choose an entry category and enter a description.");
    return;
  }
  const targetKind = category === "Hydration" ? "hydration" : "meal";
  const ounces = targetKind === "hydration" ? hydrationOunces(description) : null;
  if (targetKind === "hydration" && ounces === null) {
    toast("Include a fluid amount, such as 16 oz, 2 cups, 500 ml, or 1 liter.");
    return;
  }
  const descriptionChanged = description !== entry.description;
  const kindChanged = targetKind !== entry.kind;
  const saveButton = form.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  const changes = {
    description,
    kind: targetKind,
    meal_label: targetKind === "meal" ? category : null
  };
  const estimateHydration = targetKind === "hydration" && hydrationNeedsNutritionEstimate(description);
  if (targetKind === "hydration") {
    changes.nutrition_estimate = { ounces };
    changes.status = estimateHydration ? "pending_estimate" : "estimated";
  } else if (descriptionChanged || kindChanged) {
    changes.nutrition_estimate = null;
    changes.status = "pending_estimate";
  }
  const { error } = await supabase.from("ledger_entries").update(changes).eq("id", entry.id).eq("user_id", user.id);
  if (error) {
    toast(error.message);
    saveButton.disabled = false;
    return;
  }
  await loadLedger();
  if ((targetKind === "meal" && (descriptionChanged || kindChanged)) || estimateHydration) {
    toast(targetKind === "hydration" ? "Drink updated. Estimating its nutrition..." : "Meal updated. Recalculating nutrition...");
    const { error: estimateError } = await supabase.functions.invoke("estimate-entry", { body: { entryId: entry.id } });
    await loadLedger();
    toast(estimateError
      ? `${targetKind === "hydration" ? "Drink" : "Meal"} updated. Nutrition estimate is pending.`
      : `${targetKind === "hydration" ? "Drink" : "Meal"} and nutrition estimate updated.`);
  } else if (targetKind === "hydration") {
    toast(`Hydration updated: ${ounces} fl oz.`);
  } else {
    toast("Meal label updated.");
  }
});

$("#entry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#quick-entry"); const description = input.value.trim() || (state.photo ? "Meal photo" : "New meal");
  const selectedCategory = $("#meal-label").value;
  const ounces = hydrationOunces(description);
  const kind = selectedCategory === "Hydration" || isHydrationDescription(description) ? "hydration" : "meal";
  if (kind === "hydration" && ounces === null) {
    toast("Include a fluid amount, such as 16 oz, 2 cups, 500 ml, or 1 liter.");
    return;
  }
  let photoPath = null;
  if (state.photo) {
    const safeName = state.photo.name.replace(/[^a-z0-9._-]/gi, "-"); photoPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("meal-photos").upload(photoPath, state.photo, { upsert: false });
    if (uploadError) { toast(`Photo was not uploaded: ${uploadError.message}`); return; }
  }
  const estimateHydration = kind === "hydration" && hydrationNeedsNutritionEstimate(description);
  const nutrition = kind === "hydration" ? { ounces } : photoPath ? { photo_path: photoPath } : null;
  const mealLabel = mealLabels.has(selectedCategory) ? selectedCategory : defaultMealLabel();
  const { data: savedEntry, error } = await supabase.from("ledger_entries")
    .insert({ user_id: user.id, client_request_id: crypto.randomUUID(), kind, occurred_at: new Date().toISOString(), description, meal_label: kind === "meal" ? mealLabel : null, nutrition_estimate: nutrition, status: kind === "hydration" && !estimateHydration ? "estimated" : "pending_estimate" })
    .select("id")
    .single();
  if (error) { toast(error.message); return; }
  input.value = ""; state.photo = null; $("#photo-input").value = ""; $("#meal-label").value = defaultMealLabel();
  await loadLedger();
  if (kind === "meal" || estimateHydration) {
    toast(kind === "hydration" ? "Drink saved. Estimating its nutrition..." : "Meal saved. Estimating nutrition...");
    const { error: estimateError } = await supabase.functions.invoke("estimate-entry", { body: { entryId: savedEntry.id } });
    await loadLedger();
    toast(estimateError
      ? `${kind === "hydration" ? "Drink" : "Meal"} saved, but the estimate needs another try.`
      : "Nutrition estimate ready.");
  } else {
    toast("Saved to your private daily ledger.");
  }
});

async function estimatePendingEntries() {
  const pending = state.entries.filter((entry) =>
    (entry.kind === "meal" && entry.status === "pending_estimate") ||
    (entry.kind === "hydration" &&
      typeof entry.nutrition_estimate?.calories !== "number" &&
      hydrationNeedsNutritionEstimate(entry.description))
  ).slice(0, 3);
  for (const entry of pending) {
    const { error } = await supabase.functions.invoke("estimate-entry", { body: { entryId: entry.id } });
    if (error) break;
  }
  if (pending.length) await loadLedger();
}

document.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => startCheckout(button.dataset.plan)));

document.querySelectorAll('input[name="provider"]').forEach((input) => input.addEventListener("change", async (event) => {
  state.provider = event.target.value;
  const { error } = await supabase.from("profiles").update({ ai_routing_preference: state.provider, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  toast(error ? error.message : "AI provider preference saved. Provider connections are not active yet.");
}));

$("#feedback-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const rating = Number(new FormData(event.currentTarget).get("rating"));
  const comment = $("#feedback-comment").value.trim();
  const publicDisplayConsent = $("#feedback-public-consent").checked;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    toast("Choose a rating from one to five stars.");
    return;
  }
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  $("#feedback-status").textContent = "Saving...";
  const { error } = await supabase.from("customer_feedback").upsert({
    user_id: user.id,
    rating,
    comment,
    public_display_consent: publicDisplayConsent,
    public_consent_updated_at: publicDisplayConsent ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  button.disabled = false;
  const successMessage = publicDisplayConsent
    ? "Thank you—your feedback and sharing permission are saved."
    : "Thank you—your private feedback is saved.";
  $("#feedback-status").textContent = error ? "Feedback could not be saved." : successMessage;
  toast(error ? error.message : successMessage);
});

$("#refresh-ledger").addEventListener("click", () => loadLedger().catch((error) => toast(error.message)));
$("#sign-out").addEventListener("click", async () => { await supabase.auth.signOut(); location.replace("./auth.html"); });
supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") location.replace("./auth.html"); });

try {
  await Promise.all([loadProfile(), loadLedger(), loadMembership(), loadFeedback()]);
  if (location.hash === "#onboarding") showOnboarding();
  if (checkoutResult === "success") {
    $("#billing-status").textContent = "Your checkout was completed. Membership status will update shortly.";
    toast("Welcome to Meal Daddy.");
  } else if (checkoutResult === "cancelled") {
    $("#billing-status").textContent = "Checkout was cancelled. No new subscription was started.";
  }
  if (checkoutResult) {
    query.delete("checkout");
    const cleanQuery = query.toString();
    history.replaceState({}, "", `${location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${location.hash}`);
  }
  if (pendingPlan && $("#onboarding").hidden) await startCheckout(pendingPlan);
  await estimatePendingEntries();
} catch (error) { toast(error.message); }
