import { invokeAuthenticated, supabase, requireSession } from "./supabase-client.js?v=20261004-1";
import { buildProteinGuidance } from "./feedback-guidance.js?v=20261004-1";
import { adaptiveHydrationGuidance } from "./adaptive-hydration.js?v=20261004-1";
import { entryDateDisplayLabel, localDateValue as localEntryDateValue, occurredAtForEntryDate, quickDateOptions } from "./entry-date.js?v=20260813-4";
import { estimatedAdultBmi, formatWeight, formatWeightChange, normalizeUnitSystem, parseHeightCm, shouldEnableWeightTracking, weightFromKg, weightToKg } from "./health-metrics.js?v=20260813-4";
import { initializeSavedFoods } from "./saved-foods.js?v=20261004-11";
import { normalizeRestaurantPlan, restaurantChoiceLetters, restaurantFitLabels, restaurantMapUrl, restaurantOptionToLedgerEntry, safeRestaurantSourceUrl } from "./restaurant-plan.js?v=20261004-1";
import { estimateInflammationScore, inflammationBand, inflammationImpact, inflammationProgressBackgroundSize, summarizeInflammationEntries, summarizeInflammationReport, weightedInflammationScore } from "./inflammation-impact.js?v=20261004-4";
import { resolvePrimaryEatingStyle } from "./profile-preferences.js?v=20260929-1";
import { metricProgressSegments } from "./metric-progress.js?v=20260930-1";
import { normalizeMetricOrder, normalizeOptionalMetrics } from "./metric-order.js?v=20261004-3";
import { preparePrivateImage } from "./private-image.js?v=20261004-1";

document.querySelector("#focus-quick-entry")?.addEventListener("click", () => {
  document.querySelector("#quick-entry")?.focus();
});

const dietStyles = ["Mediterranean", "Low Inflammation", "Low-carb", "Pescatarian", "DASH", "Vegetarian", "High-protein", "Flexible"];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const session = await requireSession();
if (!session) throw new Error("Authentication required");

const appViews = new Set(["today", "log", "entries", "plan", "more"]);
function showAppView(nextView, options = {}) {
  const view = appViews.has(nextView) ? nextView : "log";
  document.body.dataset.appView = view;
  document.body.dataset.appSubview = "";
  document.querySelectorAll("[data-app-nav]").forEach((control) => {
    const active = control.dataset.appNav === view;
    control.classList.toggle("is-active", active);
    if (control.matches(".v1-top-tabs button")) control.setAttribute("aria-current", active ? "page" : "false");
  });
  if (options.focus !== false) window.scrollTo({ top: 0, behavior: "instant" });
  try { sessionStorage.setItem("mealdaddy-active-view", view); } catch {}
  if (view === "entries" && typeof renderLedger === "function") renderLedger();
}

function showAppSubview(view, subview) {
  showAppView(view, { focus: false });
  document.body.dataset.appSubview = subview;
  window.scrollTo({ top: 0, behavior: "instant" });
}

document.querySelectorAll("[data-app-nav]").forEach((control) => {
  control.addEventListener("click", () => {
    showAppView(control.dataset.appNav);
    if (control.classList.contains("v1-feedback-link")) {
      showAppSubview("more", "feedback");
    }
  });
});

document.querySelectorAll("[data-more-target]").forEach((control) => {
  control.addEventListener("click", () => {
    const target = control.dataset.moreTarget;
    if (target === "foods") {
      showAppSubview("log", "foods");
      document.querySelector("#saved-foods")?.setAttribute("open", "");
    } else if (target === "reports") {
      showAppSubview("more", "reports");
    } else if (target === "weight") {
      document.querySelector("#open-weight-panel")?.click();
    }
  });
});

// Opening MealDaddy favors fast logging unless a trusted in-app return view was supplied.
const requestedAppView = new URLSearchParams(location.search).get("view");
showAppView(appViews.has(requestedAppView) ? requestedAppView : "log", { focus: false });

document.querySelectorAll("[data-account-link]").forEach((link) => {
  link.addEventListener("click", () => {
    const currentView = appViews.has(document.body.dataset.appView) ? document.body.dataset.appView : "log";
    link.href = `./account.html?returnTo=${encodeURIComponent(`./app.html?view=${currentView}`)}`;
  });
});

document.querySelector("#recreate-favorite")?.addEventListener("click", () => openCoachAction("recipe"));

document.querySelector("#choose-favorite")?.addEventListener("click", () => {
  showAppSubview("log", "foods");
  document.querySelector("#saved-foods")?.setAttribute("open", "");
  document.querySelector(".saved-foods-summary")?.focus({ preventScroll: true });
});

document.querySelectorAll("[data-subview-back]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.subviewBack === "plan") {
      document.querySelector("#coach-action-form").hidden = true;
      clearCoachPhoto();
      clearRestaurantLocation();
    }
    showAppView(button.dataset.subviewBack);
  });
});

const user = session.user;
const allowedPlans = new Set(["core"]);
const mealLabels = new Set(["Breakfast", "Brunch", "Lunch", "Dinner", "Snack"]);
const entryCategories = [...mealLabels, "Hydration"];
const supportedMealPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maximumMealPhotoBytes = 8 * 1024 * 1024;
const query = new URLSearchParams(location.search);
let pendingPlan = allowedPlans.has(query.get("plan")) ? query.get("plan") : null;
const checkoutResult = query.get("checkout");
const state = { preferredName: "", diet: "", tone: "supportive", provider: "best_value", entries: [], recentEntries: [], ledgerReviewDate: localEntryDateValue(), weightEntries: [], photo: null, coachPhoto: null, restaurantLocation: null, restaurantPlan: null, coachMode: "dinner", membershipPlan: null, membershipStatus: null, membershipAccess: null, calorieGoal: 2050, proteinGoal: 130, netCarbGoal: 0, fiberGoal: 30, waterGoal: 90, hydrationTargetSource: "My own target", sodiumGoal: 2300, addedSugarGoal: 50, saturatedFatGoal: 20, unitSystem: "us", heightCm: null, age: null, trackBmi: false, goalWeightKg: null, eatingStyles: [], goals: [], trackingDetail: "Moderate", uses: [], reminders: [], favoriteProteins: [], foodsLoved: "", foodsDisliked: "", foodsToAvoid: "", biggestChallenge: "", optionalMetrics: [], metricOrder: normalizeMetricOrder([]), suggestedProteinTarget: 40, leftoverEntryId: null, leftoverPhoto: null, leftoverAnalysis: null, leftoverReturnFocus: null, savedFoodsApi: null, pendingQuickLog: null, skipSavedFoodMatch: false, pendingLabelCandidate: null, pendingLabelPhoto: null, estimatingEntryIds: new Set(), estimateFailures: new Map(), currentTotals: { calories: 0, protein: 0, carbs: 0, netCarbs: 0, fat: 0, fiber: 0, water: 0, sodium: null, addedSugar: null, saturatedFat: null } };
const entryById = (entryId) => state.recentEntries.find((item) => item.id === entryId) || state.entries.find((item) => item.id === entryId);
const ledgerReviewDate = $("#ledger-review-date");
if (ledgerReviewDate) {
  const earliest = new Date();
  earliest.setDate(earliest.getDate() - 6);
  ledgerReviewDate.min = localEntryDateValue(earliest);
  ledgerReviewDate.max = localEntryDateValue();
  ledgerReviewDate.value = state.ledgerReviewDate;
  ledgerReviewDate.addEventListener("change", () => {
    state.ledgerReviewDate = ledgerReviewDate.value || localEntryDateValue();
    renderLedger();
  });
}
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

function hydrationNeedsNutritionEstimate(description) {
  return /\b(cream|creamer|milk|half[\s-]?and[\s-]?half|sugar|honey|syrup|sweeten(?:ed|er)?|juice|smoothie|shake|protein|soda|pop|sports drink|energy drink|beer|wine|cocktail|liquor)\b/i.test(description);
}

$("#meal-label").value = defaultMealLabel();

const earlierDateOption = "__earlier__";

function setQuickEntryDate(value) {
  const select = $("#entry-date");
  const customField = $("#quick-custom-date");
  const customInput = $("#entry-custom-date");
  const hasRecentOption = [...select.options].some((option) => option.value === value);
  select.value = hasRecentOption ? value : earlierDateOption;
  customField.hidden = hasRecentOption;
  if (!hasRecentOption) customInput.value = value;
}

function selectedQuickEntryDate() {
  return $("#entry-date").value === earlierDateOption
    ? $("#entry-custom-date").value
    : $("#entry-date").value;
}

function resetQuickEntryDate() {
  setQuickEntryDate(localEntryDateValue());
}

function initializeQuickEntryDates() {
  const select = $("#entry-date");
  const customInput = $("#entry-custom-date");
  const options = quickDateOptions();
  select.replaceChildren(
    ...options.map((option) => new Option(option.label, option.value)),
    new Option("Earlier date…", earlierDateOption)
  );
  const earlierDefault = new Date();
  earlierDefault.setDate(earlierDefault.getDate() - options.length);
  customInput.max = localEntryDateValue();
  customInput.value = localEntryDateValue(earlierDefault);
  resetQuickEntryDate();
}

$("#entry-date").addEventListener("change", () => {
  const earlier = $("#entry-date").value === earlierDateOption;
  $("#quick-custom-date").hidden = !earlier;
  if (earlier) $("#entry-custom-date").focus();
});

initializeQuickEntryDates();

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

function mealPhotoValidationMessage(file) {
  if (!file) return "";
  if (!supportedMealPhotoTypes.has(String(file.type || "").toLowerCase())) {
    return "Use a JPG, PNG, WebP, or GIF photo.";
  }
  if (file.size > maximumMealPhotoBytes) return "Use a photo no larger than 8 MB.";
  return "";
}

function hasCurrentCoreMembership() {
  return state.membershipPlan === "core" && ["trialing", "active", "past_due"].includes(state.membershipStatus);
}

async function readFunctionFailure(error) {
  const response = error?.context;
  let status = Number(response?.status || error?.status || 0);
  let message = error?.message || "";
  try {
    if (response && typeof response.clone === "function") {
      const body = await response.clone().json();
      if (body?.error) message = body.error;
      status ||= Number(body?.status || 0);
    }
  } catch {
    // Some clients do not expose the Edge Function response body.
  }
  return { status, message };
}

function showEstimateMembershipPrompt(subject, action) {
  $("#estimate-membership-title").textContent = `${subject} ${action}, but it has not been estimated yet.`;
  $("#estimate-membership-copy").textContent = "AI nutrition estimates are included with Meal Daddy Core. Start your 7-day free trial to estimate this entry.";
  $("#estimate-membership-prompt").hidden = false;
  toast(`${subject} ${action}. Start the Core trial to add its nutrition estimate.`);
}

function rememberEstimateFailure(entryId, message) {
  if (!entryId) return;
  state.estimateFailures.set(entryId, message);
  renderLedger();
}

async function handleEstimateFailure(error, subject, action = "saved", entryId = null) {
  const failure = await readFunctionFailure(error);
  const membershipRequired = failure.status === 402 || /active Meal Daddy Core membership is required/i.test(failure.message);
  if (membershipRequired && state.membershipAccess === "family") {
    const message = "Complimentary access could not be verified. Retry the estimate, then sign out and back in if it continues.";
    rememberEstimateFailure(entryId, message);
    toast(message);
    return message;
  }
  if (membershipRequired) {
    const message = "An active Meal Daddy Core membership is required before this estimate can finish.";
    rememberEstimateFailure(entryId, message);
    showEstimateMembershipPrompt(subject, action);
    return message;
  }
  if (failure.status === 429 || /monthly Core AI allowance/i.test(failure.message)) {
    const message = "This month's Core AI allowance has been reached. This entry is not included in totals yet.";
    rememberEstimateFailure(entryId, message);
    toast(`${subject} ${action}. ${message}`);
    return message;
  }
  const message = "The estimate needs another try. This entry is not included in totals yet.";
  rememberEstimateFailure(entryId, message);
  toast(`${subject} ${action}, but the nutrition estimate could not finish. Use Retry estimate on the entry.`);
  return message;
}

async function retryEstimateEntry(entryId, { announceStart = true, announceSuccess = true } = {}) {
  const entry = entryById(entryId);
  if (!entry || entry.status !== "pending_estimate" || state.estimatingEntryIds.has(entryId)) return false;
  const subject = entry.kind === "hydration" ? "Drink" : "Meal";
  state.estimatingEntryIds.add(entryId);
  state.estimateFailures.delete(entryId);
  renderLedger();
  if (announceStart) toast(`Retrying the ${subject.toLowerCase()} estimate...`);
  try {
    const { data, error } = await invokeAuthenticated("estimate-entry", { body: { entryId } });
    if (error) {
      await handleEstimateFailure(error, subject, "saved", entryId);
      return false;
    }
    state.estimateFailures.delete(entryId);
    $("#estimate-membership-prompt").hidden = true;
    await loadLedger();
    if (data?.labelCandidate && state.savedFoodsApi) showLabelSavePrompt(data.labelCandidate, null);
    if (announceSuccess) toast(`${subject} estimate updated and included in today’s totals.`);
    return true;
  } catch (error) {
    await handleEstimateFailure(error, subject, "saved", entryId);
    return false;
  } finally {
    state.estimatingEntryIds.delete(entryId);
    renderLedger();
  }
}

async function addMealImpactDetails(entryId, { announceStart = true, announceSuccess = true } = {}) {
  const entry = entryById(entryId);
  if (!entry || entry.kind !== "meal" || entry.status !== "estimated" || state.estimatingEntryIds.has(entryId)) return false;
  if (!hasCurrentCoreMembership()) {
    showEstimateMembershipPrompt("Meal", "saved");
    return false;
  }
  state.estimatingEntryIds.add(entryId);
  renderLedger();
  if (announceStart) toast("Adding food impact details and the Inflammation Score...");
  try {
    const { error } = await invokeAuthenticated("estimate-entry", { body: { entryId, itemizeExisting: true } });
    if (error) {
      const failure = await readFunctionFailure(error);
      if (failure.status === 402 && state.membershipAccess === "family") {
        toast("Complimentary access could not be verified. Sign out and back in, then try again.");
      } else if (failure.status === 402) {
        showEstimateMembershipPrompt("Meal", "saved");
      } else if (failure.status === 429) {
        toast("This month's Core AI allowance has been reached. Existing nutrition totals are unchanged.");
      } else {
        toast("Meal impact details could not be added. Your existing nutrition totals are unchanged.");
      }
      return false;
    }
    await loadLedger();
    if (announceSuccess) toast("Meal details and Inflammation Score added.");
    return true;
  } catch {
    toast("Meal impact details could not be added. Your existing nutrition totals are unchanged.");
    return false;
  } finally {
    state.estimatingEntryIds.delete(entryId);
    renderLedger();
  }
}

async function startCheckout(plan) {
  if (!allowedPlans.has(plan)) return;
  const buttons = document.querySelectorAll("[data-plan]");
  const status = $("#billing-status");
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = "Opening secure Stripe Checkout...";
  try {
    const { data, error } = await invokeAuthenticated("create-checkout", { body: { plan } });
    if (error) throw error;
    const checkoutUrl = data?.url ? new URL(data.url) : null;
    if (!checkoutUrl || checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") {
      throw new Error(data?.error || "Stripe Checkout did not return a valid address.");
    }
    pendingPlan = null;
    location.assign(checkoutUrl.href);
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
  const currentView = appViews.has(document.body.dataset.appView) ? document.body.dataset.appView : "log";
  const setupParams = new URLSearchParams();
  if (pendingPlan) setupParams.set("plan", pendingPlan);
  setupParams.set("returnTo", `./app.html?view=${currentView}`);
  location.assign(`./setup.html?${setupParams.toString()}`);
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
  const profile = data.onboarding_data || {};
  state.diet = resolvePrimaryEatingStyle({ dietStyle: data.diet_style, primaryEatingStyle: profile.primary_eating_style, eatingStyles: profile.eating_styles });
  state.tone = data.coaching_tone;
  state.provider = data.ai_routing_preference || "best_value";
  state.preferredName = String(profile.name || user.user_metadata?.first_name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
  $("#greeting").textContent = state.preferredName
    ? `Welcome back, ${state.preferredName}.`
    : "Welcome back. Good to see you.";
  const goals = profile.primary_goals || (profile.primary_goal ? [profile.primary_goal] : []);
  state.goals = Array.isArray(goals) ? goals : [];
  state.eatingStyles = Array.isArray(profile.eating_styles) ? profile.eating_styles : [];
  state.optionalMetrics = normalizeOptionalMetrics(profile.today_optional_metrics);
  state.metricOrder = normalizeMetricOrder(profile.today_metric_order, profile);
  const metricGrid = $("#today-metrics");
  metricGrid?.querySelectorAll(".optional-metric").forEach((metric) => {
    metric.hidden = !state.optionalMetrics.includes(metric.dataset.metricOrder);
  });
  state.metricOrder.forEach((key) => {
    const metric = metricGrid?.querySelector(`[data-metric-order="${key}"]`);
    if (metric) metricGrid.append(metric);
  });
  state.trackingDetail = profile.tracking_detail || "Moderate";
  state.uses = Array.isArray(profile.mealdaddy_uses) ? profile.mealdaddy_uses : [];
  syncWeightLauncher();
  state.reminders = Array.isArray(profile.reminders) ? profile.reminders : [];
  state.favoriteProteins = Array.isArray(profile.favorite_proteins) ? profile.favorite_proteins : [];
  state.foodsLoved = profile.foods_loved || "";
  state.foodsDisliked = profile.foods_disliked || "";
  state.foodsToAvoid = profile.foods_to_avoid || "";
  state.biggestChallenge = profile.biggest_challenge || "";
  state.unitSystem = normalizeUnitSystem(profile.unit_system);
  state.heightCm = parseHeightCm(profile.height, state.unitSystem);
  state.age = Number(profile.age) || null;
  state.trackBmi = profile.track_bmi === "Yes";
  state.goalWeightKg = weightToKg(profile.goal_weight, state.unitSystem);
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
  const fiberGoal = Number(profile.fiber_goal || 30);
  const waterGoal = Number(profile.water_goal || 90);
  state.calorieGoal = calorieGoal;
  state.proteinGoal = proteinGoal;
  state.fiberGoal = fiberGoal;
  state.waterGoal = waterGoal;
  state.hydrationTargetSource = profile.hydration_target_source || "My own target";
  state.sodiumGoal = Math.max(1, Number(profile.sodium_goal_mg || 2300));
  state.addedSugarGoal = Math.max(1, Number(profile.added_sugar_goal_g || Math.round(calorieGoal * 0.1 / 4)));
  state.saturatedFatGoal = Math.max(1, Number(profile.saturated_fat_goal_g || Math.round(calorieGoal * 0.1 / 9)));
  const totalCarbGoal = state.netCarbGoal ? state.netCarbGoal + fiberGoal : Math.round(calorieGoal * 0.45 / 4);
  const fatGoal = Math.max(30, Math.round((calorieGoal - proteinGoal * 4 - totalCarbGoal * 4) / 9));
  $("#energy-progress").max = calorieGoal;
  $("#protein-progress").max = proteinGoal;
  $("#carbs-progress").max = totalCarbGoal;
  $("#net-carbs-progress").max = state.netCarbGoal || totalCarbGoal;
  $("#fat-progress").max = fatGoal;
  $("#fiber-progress").max = fiberGoal;
  $("#water-progress").max = waterGoal;
  $("#sodium-progress").max = state.sodiumGoal;
  $("#added-sugar-progress").max = state.addedSugarGoal;
  $("#saturated-fat-progress").max = state.saturatedFatGoal;
  $("#energy-goal-label").textContent = calorieGoal.toLocaleString();
  $("#protein-goal-label").textContent = `${proteinGoal}g`;
  $("#carbs-goal-label").textContent = `${totalCarbGoal}g`;
  $("#net-carbs-goal-label").textContent = `${state.netCarbGoal || totalCarbGoal}g`;
  $("#fat-goal-label").textContent = `${fatGoal}g`;
  $("#fiber-goal-label").textContent = `${fiberGoal}g`;
  $("#water-goal-label").textContent = `${waterGoal}oz`;
  $("#sodium-goal-label").textContent = `${state.sodiumGoal.toLocaleString()}mg`;
  $("#added-sugar-goal-label").textContent = `${state.addedSugarGoal}g`;
  $("#saturated-fat-goal-label").textContent = `${state.saturatedFatGoal}g`;
  $("#profile-diet").textContent = state.diet;
  $("#weight-unit").value = state.unitSystem;
  $("#tone-options").value = state.tone;
  renderCoachFeedback();
  const provider = document.querySelector(`input[name="provider"][value="${state.provider}"]`);
  if (provider) provider.checked = true;
}

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

let weightPanelReturnFocus = null;
let weightChartPeriod = "year";

function weightTrackingEnabled() {
  return shouldEnableWeightTracking({ uses: state.uses, goals: state.goals });
}

function todaysWeightEntry() {
  return state.weightEntries.find((entry) => entry.measured_on === localDateValue()) || null;
}

function syncWeightLauncher() {
  const enabled = weightTrackingEnabled();
  $("#weight-launcher").hidden = !enabled;
  const today = todaysWeightEntry();
  $("#open-weight-panel").textContent = today ? "Update today’s weight" : "Log today’s weight";
  $("#save-weight").textContent = today ? "Update weight" : "Save weight";
  if (!enabled && !$("#weight-panel").hidden) closeWeightPanel();
}

function prepareWeightForm() {
  const today = todaysWeightEntry();
  $("#weight-date").value = localDateValue();
  $("#weight-unit").value = state.unitSystem;
  $("#weight-source").value = today?.source || "home";
  $("#weight-bmi-override").value = today?.bmi_override || "";
  const displayWeight = today ? weightFromKg(today.weight_kg, state.unitSystem) : null;
  $("#weight-value").value = displayWeight ? String(Math.round(displayWeight * 10) / 10) : "";
  $("#weight-status").textContent = today ? "Today’s weigh-in is already saved. Change the value and update it if needed." : "";
}

function openWeightPanel(trigger = $("#open-weight-panel")) {
  if (!weightTrackingEnabled()) return;
  weightPanelReturnFocus = trigger;
  prepareWeightForm();
  $("#weight-panel").hidden = false;
  document.body.classList.add("modal-open");
  $("#weight-value").focus();
}

function closeWeightPanel() {
  if ($("#weight-panel").hidden) return;
  $("#weight-panel").hidden = true;
  document.body.classList.remove("modal-open");
  weightPanelReturnFocus?.focus();
  weightPanelReturnFocus = null;
}

function weightSourceLabel(source) {
  return ({ setup: "Setup", home: "Home", clinic: "Doctor or clinic", gym: "Gym", smart_scale: "Smart scale", other: "Other" })[source] || "Measurement";
}

function weightEntriesForPeriod(entries, period = weightChartPeriod) {
  if (!entries.length) return [];
  const latestDate = new Date(`${entries.at(-1).measured_on}T12:00:00`);
  const cutoff = new Date(latestDate);
  if (period === "year") {
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    cutoff.setDate(1);
  } else {
    const days = period === "week" ? 7 : 30;
    cutoff.setDate(cutoff.getDate() - (days - 1));
  }
  return entries.filter((entry) => new Date(`${entry.measured_on}T12:00:00`) >= cutoff);
}

function renderWeightChart(entries) {
  const trend = $("#weight-trend");
  const chart = $("#weight-chart");
  const line = $("#weight-chart-line");
  const area = $("#weight-chart-area");
  const goalLine = $("#weight-goal-line");
  const pointsRoot = $("#weight-chart-points");
  const point = $("#weight-chart-point");
  if (!trend || !chart || !line || !area || !goalLine || !pointsRoot || !point || entries.length === 0) {
    if (trend) trend.hidden = true;
    return;
  }
  trend.hidden = false;
  $("#weight-goal-legend").hidden = !state.goalWeightKg;
  if (entries.length === 1) {
    line.setAttribute("points", "");
    area.setAttribute("points", "");
    pointsRoot.replaceChildren();
    point.setAttribute("cx", "300");
    point.setAttribute("cy", "105");
    goalLine.setAttribute("hidden", "");
    point.removeAttribute("hidden");
    $("#weight-trend-copy").textContent = `1 weigh-in in this ${weightChartPeriod}`;
    return;
  }
  const weights = entries.map((entry) => Number(entry.weight_kg));
  const weightScaleValues = state.goalWeightKg ? [...weights, state.goalWeightKg] : weights;
  const minimum = Math.min(...weightScaleValues);
  const maximum = Math.max(...weightScaleValues);
  const rawSpread = Math.max(maximum - minimum, 0.5);
  const padding = Math.max(rawSpread * 0.12, 0.25);
  const scaleMinimum = minimum - padding;
  const scaleMaximum = maximum + padding;
  const spread = scaleMaximum - scaleMinimum;
  const entryTimes = entries.map((entry) => new Date(`${entry.measured_on}T12:00:00`).getTime());
  const firstTime = entryTimes[0];
  const timeSpan = Math.max(entryTimes.at(-1) - firstTime, 1);
  const points = entries.map((entry, index) => {
    const x = 12 + ((entryTimes[index] - firstTime) / timeSpan) * 576;
    const y = 186 - ((Number(entry.weight_kg) - scaleMinimum) / spread) * 162;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  line.setAttribute("points", points);
  area.setAttribute("points", `12,186 ${points} 588,186`);
  if (state.goalWeightKg) {
    const goalY = 186 - ((state.goalWeightKg - scaleMinimum) / spread) * 162;
    goalLine.setAttribute("y1", goalY.toFixed(1));
    goalLine.setAttribute("y2", goalY.toFixed(1));
    goalLine.innerHTML = `<title>${escapeHtml(`Goal weight ${formatWeight(state.goalWeightKg, state.unitSystem)}`)}</title>`;
    goalLine.removeAttribute("hidden");
  } else goalLine.setAttribute("hidden", "");
  pointsRoot.innerHTML = points.split(" ").map((coordinates, index) => {
    const [cx, cy] = coordinates.split(",");
    const displayWeight = Math.round(weightFromKg(entries[index].weight_kg, state.unitSystem) * 10) / 10;
    const unit = state.unitSystem === "metric" ? "kg" : "lb";
    return `<circle cx="${cx}" cy="${cy}" r="4"><title>${escapeHtml(`${entries[index].measured_on}: ${displayWeight} ${unit}`)}</title></circle>`;
  }).join("");
  const [latestX, latestY] = points.split(" ").at(-1).split(",");
  point.setAttribute("cx", latestX);
  point.setAttribute("cy", latestY);
  point.removeAttribute("hidden");
  const latestWeight = Number(entries.at(-1).weight_kg);
  const goalCopy = state.goalWeightKg ? ` · ${formatWeight(Math.abs(latestWeight - state.goalWeightKg), state.unitSystem)} from goal` : "";
  const periodLabel = weightChartPeriod === "week" ? "past week" : weightChartPeriod === "month" ? "past month" : "past year";
  $("#weight-trend-copy").textContent = `${entries.length} weigh-ins · ${periodLabel}${goalCopy}`;
  chart.setAttribute("aria-label", `Weight trend for the ${periodLabel}`);
}

function renderWeightProgress() {
  const ordered = [...state.weightEntries].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const starting = ordered[0] || null;
  const latest = ordered.at(-1) || null;
  $("#weight-starting").textContent = starting ? formatWeight(starting.weight_kg, state.unitSystem) : "—";
  $("#weight-latest").textContent = latest ? formatWeight(latest.weight_kg, state.unitSystem) : "—";
  $("#weight-change").textContent = starting && latest ? formatWeightChange(Number(latest.weight_kg) - Number(starting.weight_kg), state.unitSystem) : "—";

  const bmi = latest ? estimatedAdultBmi({
    weightKg: latest.weight_kg,
    heightCm: state.heightCm,
    age: state.age,
    enabled: state.trackBmi,
    override: latest.bmi_override
  }) : null;
  $("#bmi-label").textContent = bmi?.source === "entered" ? "Entered BMI" : "Estimated BMI";
  $("#weight-bmi").textContent = bmi ? bmi.value.toFixed(1) : state.trackBmi && state.age && state.age < 20 ? "Adult view unavailable" : state.trackBmi ? "—" : "Off";

  renderWeightChart(weightEntriesForPeriod(ordered));
  const recent = ordered.slice(-5).reverse();
  $("#weight-history").hidden = recent.length === 0;
  $("#weight-history-list").innerHTML = recent.map((entry) => `<li><div><strong>${escapeHtml(formatWeight(entry.weight_kg, state.unitSystem))}</strong><span>${escapeHtml(entry.measured_on)} · ${escapeHtml(weightSourceLabel(entry.source))}${entry.bmi_override ? ` · entered BMI ${Number(entry.bmi_override).toFixed(1)}` : ""}</span></div><button type="button" data-delete-weight="${entry.id}" aria-label="Delete weight measurement from ${escapeHtml(entry.measured_on)}">Delete</button></li>`).join("");
  syncWeightLauncher();
}

$$('[data-weight-period]').forEach((button) => button.addEventListener("click", () => {
  weightChartPeriod = button.dataset.weightPeriod;
  $$('[data-weight-period]').forEach((choice) => {
    const active = choice === button;
    choice.classList.toggle("is-active", active);
    choice.setAttribute("aria-pressed", String(active));
  });
  renderWeightProgress();
}));

async function loadWeightEntries() {
  const { data, error } = await supabase
    .from("weight_entries")
    .select("id,measured_on,weight_kg,source,bmi_override,body_fat_pct,waist_cm,note")
    .eq("user_id", user.id)
    .order("measured_on", { ascending: true });
  if (error) throw error;
  state.weightEntries = data || [];
  renderWeightProgress();
  return state.weightEntries;
}

async function loadMembership() {
  const [subscriptionResult, grantResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_key,status,trial_ends_at,current_period_ends_at,cancel_at_period_end")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("complimentary_access_grants")
      .select("access_type,status")
      .eq("user_id", user.id)
      .maybeSingle()
  ]);
  if (subscriptionResult.error) throw subscriptionResult.error;
  if (grantResult.error) throw grantResult.error;
  const data = subscriptionResult.data;
  const currentStripeMembership = data && ["trialing", "active", "past_due", "unpaid"].includes(data.status);
  const familyAccess = !currentStripeMembership &&
    grantResult.data?.access_type === "family" &&
    grantResult.data.status === "active";
  if (familyAccess) {
    state.membershipPlan = "core";
    state.membershipStatus = "active";
    state.membershipAccess = "family";
    $("#estimate-membership-prompt").hidden = true;
    $("#subscription").hidden = true;
    $("#plan-options").hidden = true;
    $("#trial-note").hidden = true;
    $("#subscription-title").textContent = "Complimentary Family Access";
    $("#subscription-copy").textContent = "Your Meal Daddy Core access is complimentary. No payment method or monthly fee is connected to this access.";
    $("#billing-status").textContent = "Complimentary access active";
    $("#provider-settings").hidden = true;
    return;
  }
  state.membershipPlan = data?.plan_key || null;
  state.membershipStatus = data?.status || null;
  state.membershipAccess = data ? "stripe" : null;
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
  $("#estimate-membership-prompt").hidden = true;
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
  start.setDate(start.getDate() - 6);
  const { data, error } = await supabase.from("ledger_entries").select("id,kind,occurred_at,description,meal_label,nutrition_estimate,status").gte("occurred_at", start.toISOString()).order("occurred_at", { ascending: false });
  if (error) throw error;
  state.recentEntries = data || [];
  const today = localEntryDateValue();
  state.entries = state.recentEntries.filter((entry) => localEntryDateValue(new Date(entry.occurred_at)) === today);
  const pendingIds = new Set(state.recentEntries.filter((entry) => entry.status === "pending_estimate").map((entry) => entry.id));
  for (const entryId of state.estimateFailures.keys()) {
    if (!pendingIds.has(entryId)) state.estimateFailures.delete(entryId);
  }
  renderLedger();
  renderTotals();
  if (metricBreakdownCurrentMetric) renderMetricBreakdown(metricBreakdownCurrentMetric);
}

function normalizedMealImpactComponents(estimate = {}) {
  const components = Array.isArray(estimate.components)
    ? estimate.components.filter((component) => component && typeof component.name === "string").map((component) => ({ ...component }))
    : [];
  if (!components.length) return components;
  for (const field of ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "hydration_ounces"]) {
    const target = Number(estimate[field] || 0);
    const componentTotal = components.reduce((sum, component) => sum + Number(component[field] || 0), 0);
    if (target >= 0 && componentTotal > 0) {
      const scale = target / componentTotal;
      components.forEach((component) => { component[field] = Number(component[field] || 0) * scale; });
    }
  }
  const targetNet = typeof estimate.net_carbs_g === "number"
    ? Math.max(0, Number(estimate.net_carbs_g))
    : Math.max(0, Number(estimate.carbs_g || 0) - Number(estimate.fiber_g || 0));
  const componentNetTotal = components.reduce((sum, component) => sum + Math.max(0, Number(component.net_carbs_g || 0)), 0);
  if (componentNetTotal > 0) {
    const netScale = targetNet / componentNetTotal;
    components.forEach((component) => {
      component.net_carbs_g = Math.min(Number(component.carbs_g || 0), Math.max(0, Number(component.net_carbs_g || 0) * netScale));
    });
  }
  const normalizedNetTotal = components.reduce((sum, component) => sum + Number(component.net_carbs_g || 0), 0);
  if (normalizedNetTotal < targetNet) {
    const headroom = components.reduce((sum, component) => sum + Math.max(0, Number(component.carbs_g || 0) - Number(component.net_carbs_g || 0)), 0);
    if (headroom > 0) {
      components.forEach((component) => {
        const componentHeadroom = Math.max(0, Number(component.carbs_g || 0) - Number(component.net_carbs_g || 0));
        component.net_carbs_g = Number(component.net_carbs_g || 0) + (targetNet - normalizedNetTotal) * (componentHeadroom / headroom);
      });
    }
  }
  return components;
}

function mealImpactDetails(entry) {
  if (entry.kind !== "meal" || entry.status === "pending_estimate") return "";
  const estimate = entry.nutrition_estimate || {};
  const components = normalizedMealImpactComponents(estimate);
  const score = estimateInflammationScore(estimate);
  const band = inflammationBand(score);
  const isRunning = state.estimatingEntryIds.has(entry.id);
  const complete = score !== null && components.length > 0 && components.every((component) => estimateInflammationScore(component) !== null);
  const impactLabels = { helpful: "Helpful", neutral: "Neutral", watch: "Worth watching" };
  const componentRows = components.length
    ? components.map((component) => {
        const componentScore = estimateInflammationScore(component);
        const impact = inflammationImpact(component.inflammation_impact);
        const netCarbs = typeof component.net_carbs_g === "number"
          ? Number(component.net_carbs_g)
          : Math.max(0, Number(component.carbs_g || 0) - Number(component.fiber_g || 0));
        const impactCopy = componentScore === null
          ? "Impact estimate is being added."
          : String(component.inflammation_note || "Estimated from the food, preparation, and processing details supplied.");
        return `<li>
          <div class="meal-impact-component-heading"><strong>${escapeHtml(component.name)}</strong>${componentScore === null ? "" : `<span class="impact-${impact}">${escapeHtml(impactLabels[impact])} · ${formatEstimateNumber(componentScore)}/10</span>`}</div>
          <p>${Math.round(Number(component.calories || 0)).toLocaleString()} cal · ${formatEstimateNumber(component.protein_g)}g protein · ${formatEstimateNumber(component.carbs_g)}g/${formatEstimateNumber(netCarbs)}g total/net carbs</p>
          <small>${escapeHtml(impactCopy)}</small>
        </li>`;
      }).join("")
    : '<li class="meal-impact-empty">Food-by-food details have not been added to this earlier estimate yet.</li>';
  const scoreBlock = score === null
    ? `<div class="meal-impact-score is-unscored"><span>Inflammation Score™</span><strong>Not scored yet</strong></div>`
    : `<div class="meal-impact-score impact-score-${band.tone}"><span>Inflammation Score™</span><strong>${formatEstimateNumber(score)}/10</strong><em>${escapeHtml(band.label)}</em></div>`;
  const summary = score === null
    ? "Add impact details to see how the foods and preparation may influence this guidance score."
    : String(estimate.inflammation_summary || "Food-pattern impact estimated from the details supplied.");
  const addDetails = complete
    ? ""
    : `<button class="button button-quiet meal-impact-add" type="button" data-add-impact="${entry.id}"${isRunning ? " disabled" : ""}>${isRunning ? "Adding details…" : "Add impact details"}</button>`;
  return `<details class="meal-impact-details">
    <summary><span>Meal details &amp; food impact</span>${score === null ? "" : `<em>${formatEstimateNumber(score)}/10</em>`}</summary>
    <div class="meal-impact-body">
      <div class="meal-impact-overview">${scoreBlock}<p>${escapeHtml(summary)}</p></div>
      <p class="meal-impact-scale">1 = strongly anti-inflammatory · 10 = highly inflammatory. This is an estimated food-pattern score, not a medical test or diagnosis.</p>
      <ul class="meal-impact-components">${componentRows}</ul>
      ${addDetails}
    </div>
  </details>`;
}

export function estimateTrustDetails(entry) {
  const estimate = entry?.nutrition_estimate || {};
  if (entry?.kind !== "meal" || entry.status !== "estimated") return null;
  const sourceDetails = {
    saved_food: ["Reviewed saved values", "Values came from a food or meal you previously reviewed."],
    restaurant_published: ["Restaurant-published", "The restaurant’s published information supports these values."],
    restaurant_estimate: ["Restaurant estimate", "The restaurant did not publish complete values for this customized order."],
    nutrition_label_photo: ["Label-informed", "A readable Nutrition Facts label supplied the primary values."],
    meal_photo_estimate: ["Photo estimate", "Meal contents and portions were interpreted from the photograph and your clarifying details."],
    ai_text_estimate: ["Description estimate", "Values were estimated from the food, amounts, and preparation details you entered."]
  };
  const [label, explanation] = sourceDetails[estimate.source] || ["Nutrition estimate", "Values were estimated from the information available for this entry."];
  const confidence = ["low", "medium", "high"].includes(estimate.confidence) ? estimate.confidence : "medium";
  let uncertainty = String(estimate.description_reconciliation_note || "").trim();
  if (!uncertainty) {
    if (estimate.source === "meal_photo_estimate") uncertainty = confidence === "high" ? "Visible foods were clear; exact portion size can still vary." : "Portion size and ingredients not visible in the photo are the main uncertainty.";
    else if (estimate.source === "restaurant_estimate") uncertainty = "Preparation, serving size, and restaurant substitutions may change the result.";
    else if (estimate.source === "nutrition_label_photo") uncertainty = "Accuracy depends on the photographed serving size and the amount actually eaten.";
    else if (estimate.source === "saved_food") uncertainty = "These values are reliable only while the saved recipe and serving remain unchanged.";
    else uncertainty = "Unstated serving size, ingredients, oils, and sauces can change the result.";
  }
  return { label, explanation, confidence, uncertainty };
}

function renderLedger() {
  const reviewingHistory = document.body.dataset.appView === "entries";
  const visibleEntries = reviewingHistory
    ? state.recentEntries.filter((entry) => localEntryDateValue(new Date(entry.occurred_at)) === state.ledgerReviewDate)
    : state.entries;
  if ($("#ledger-date-title")) {
    $("#ledger-date-title").textContent = state.ledgerReviewDate === localEntryDateValue()
      ? "Today's entries"
      : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date(`${state.ledgerReviewDate}T12:00:00`));
  }
  if (!visibleEntries.length) {
    $("#ledger-list").innerHTML = '<li class="ledger-empty">Nothing logged yet. Your first entry takes only a few seconds.</li>';
    return;
  }
  $("#ledger-list").innerHTML = visibleEntries.map((entry) => {
    const estimate = entry.nutrition_estimate || {};
    const mealHydration = Number(estimate.hydration_ounces || 0);
    const meta = entry.kind === "hydration"
      ? `${estimate.ounces || 0} fl oz${Number(estimate.calories || 0) > 0 ? ` · ${Math.round(estimate.calories)} cal` : entry.status === "pending_estimate" ? " · Estimate pending" : ""}`
      : entry.status === "pending_estimate" ? "Estimate pending" : `${estimate.calories || 0} cal${mealHydration > 0 ? ` · ${Math.round(mealHydration)} fl oz` : ""}`;
    const label = entry.kind === "hydration" ? "Hydration" : mealLabels.has(entry.meal_label) ? entry.meal_label : "Meal";
    const ledgerIcon = entry.kind === "hydration" ? "H" : mealLabels.has(entry.meal_label) ? entry.meal_label.charAt(0) : "M";
    const currentCategory = entry.kind === "hydration" ? "Hydration" : mealLabels.has(entry.meal_label) ? entry.meal_label : defaultMealLabel(new Date(entry.occurred_at));
    const edit = `<button class="ledger-edit-button" type="button" data-edit-entry="${entry.id}" aria-label="Edit ${escapeHtml(label)}">Edit</button>`;
    const portionAdjusted = Boolean(estimate.leftover_adjustment?.original_estimate);
    const canAdjustPortion = entry.kind === "meal" && entry.status === "estimated" && typeof estimate.calories === "number";
    const canSaveFavorite = entry.kind === "meal" && entry.status === "estimated" && typeof estimate.calories === "number";
    const favoriteStatus = canSaveFavorite ? state.savedFoodsApi?.favoriteStatus(entry) : null;
    const favoriteControl = favoriteStatus?.status === "exact"
      ? `<span class="ledger-favorite-status" title="Already saved in My Foods"><span aria-hidden="true">🍎</span><span>Favorite</span></span>`
      : favoriteStatus?.status === "edited"
        ? `<span class="ledger-favorite-status ledger-favorite-edited" title="This meal was edited after it was logged from My Foods"><span aria-hidden="true">🍎</span><span>Edited favorite</span></span><span class="ledger-favorite-choices"><button type="button" data-save-entry-favorite="${entry.id}" data-favorite-mode="update">Update favorite</button><button type="button" data-save-entry-favorite="${entry.id}" data-favorite-mode="new">Save as new</button></span>`
        : canSaveFavorite
          ? `<button class="ledger-favorite-button" type="button" data-save-entry-favorite="${entry.id}" data-favorite-mode="new">Save as favorite</button>`
          : "";
    const trust = estimateTrustDetails(entry);
    const sourceLabel = trust?.label || "";
    const sourceBadge = sourceLabel ? `<em class="ledger-source-badge">${sourceLabel}</em>` : "";
    const trustDetails = trust ? `<details class="ledger-trust-details"><summary>How reliable is this?</summary><div><p><strong>${escapeHtml(trust.label)} · ${escapeHtml(trust.confidence)} confidence</strong>${escapeHtml(trust.explanation)}</p><p><strong>Main uncertainty</strong>${escapeHtml(trust.uncertainty)}</p><button type="button" data-edit-entry="${entry.id}">Correct this entry</button></div></details>` : "";
    const estimateIsRunning = state.estimatingEntryIds.has(entry.id);
    const pendingMessage = state.estimateFailures.get(entry.id) || "Nutrition is not included in your totals until this estimate finishes.";
    const retryEstimate = entry.status === "pending_estimate"
      ? `<div class="ledger-estimate-retry" role="status"><span>${escapeHtml(estimateIsRunning ? "Estimating now…" : pendingMessage)}</span><button type="button" data-retry-estimate="${entry.id}"${estimateIsRunning ? " disabled" : ""}>${estimateIsRunning ? "Estimating…" : "Retry estimate"}</button></div>`
      : "";
    const adjustPortion = canAdjustPortion ? `<button class="button button-quiet ledger-after-photo-button" type="button" data-adjust-leftovers="${entry.id}">Add after / leftover photo</button>` : "";
    const undoPortion = portionAdjusted ? `<button class="button button-quiet" type="button" data-undo-leftover="${entry.id}">Undo portion correction</button>` : "";
    const editor = `<form class="ledger-edit-form" data-edit-form="${entry.id}" hidden>
          <label><span>Log as</span><select name="entry_category">${entryCategories.map((option) => `<option${option === currentCategory ? " selected" : ""}>${option}</option>`).join("")}</select></label>
          <label><span>Description</span><input name="description" value="${escapeHtml(entry.description)}" required maxlength="1200" /></label>
          <div><button class="button button-primary" type="submit">Save</button><button class="button button-quiet" type="button" data-cancel-edit="${entry.id}">Cancel</button>${adjustPortion}${undoPortion}<button class="button button-delete-entry" type="button" data-delete-entry="${entry.id}">Delete entry</button></div>
        </form>`;
    return `<li class="ledger-item">
      <span class="ledger-icon" aria-hidden="true">${ledgerIcon}</span>
      <span class="ledger-main"><strong>${escapeHtml(entry.description)}</strong></span>
      <span class="ledger-actions"><small>${meta}</small>${sourceBadge}${favoriteControl}${edit}</span>
      ${retryEstimate}
      ${trustDetails}
      ${mealImpactDetails(entry)}
      ${editor}
    </li>`;
  }).join("");
}

function updateMetricBar(progressId, value) {
  const progress = $(progressId);
  if (!progress) return;
  const goal = Math.max(1, Number(progress.max || 1));
  let track = progress.nextElementSibling;
  if (!track?.classList.contains("v1-over-track")) {
    track = document.createElement("span");
    track.className = "v1-over-track";
    track.innerHTML = '<i class="v1-goal-fill"></i><i class="v1-excess-fill"></i>';
    progress.insertAdjacentElement("afterend", track);
  }
  const goalFill = track.querySelector(".v1-goal-fill");
  const excessFill = track.querySelector(".v1-excess-fill");
  const segments = metricProgressSegments(value, goal);
  goalFill.style.width = `${segments.goalWidth}%`;
  excessFill.style.width = `${segments.excessWidth}%`;
  track.classList.toggle("is-over", segments.over);
  track.setAttribute("aria-label", segments.over ? `${Math.round(value - goal)} over target` : `${Math.round((value / goal) * 100)} percent of target`);
}

function updateInflammationBar(score) {
  updateMetricBar("#inflammation-progress", score ?? 0);
  const track = $("#inflammation-progress").nextElementSibling;
  const fill = track.querySelector(".v1-goal-fill");
  track.classList.add("is-inflammation");
  fill.style.background = "linear-gradient(90deg, var(--v1-lime) 0%, var(--v1-lime) 10%, #49c9b0 55%, #258cff 90%, #258cff 100%)";
  fill.style.backgroundSize = inflammationProgressBackgroundSize(score);
  fill.style.backgroundRepeat = "no-repeat";
  track.setAttribute("aria-label", score === null
    ? "Not scored yet"
    : `Inflammation impact ${formatEstimateNumber(score)} out of 10; lower is the goal`);
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
    if (typeof n.sodium_mg === "number") sum.sodium = Number(sum.sodium || 0) + n.sodium_mg;
    if (typeof n.added_sugar_g === "number") sum.addedSugar = Number(sum.addedSugar || 0) + n.added_sugar_g;
    if (typeof n.saturated_fat_g === "number") sum.saturatedFat = Number(sum.saturatedFat || 0) + n.saturated_fat_g;
    return sum;
  }, { calories: 0, protein: 0, carbs: 0, netCarbs: 0, fat: 0, fiber: 0, water: 0, sodium: null, addedSugar: null, saturatedFat: null });
  const inflammation = summarizeInflammationEntries(state.entries);
  $("#energy-total").textContent = Math.round(totals.calories).toLocaleString();
  $("#protein-total").textContent = `${Math.round(totals.protein)}g`;
  $("#carbs-total").textContent = `${Math.round(totals.carbs)}g`;
  $("#net-carbs-total").textContent = `${Math.round(totals.netCarbs)}g`;
  $("#fat-total").textContent = `${Math.round(totals.fat)}g`;
  $("#fiber-total").textContent = `${Math.round(totals.fiber)}g`;
  $("#water-total").textContent = `${Math.round(totals.water)}oz`;
  $("#inflammation-total").textContent = inflammation.score === null ? "—" : formatEstimateNumber(inflammation.score);
  $("#sodium-total").textContent = totals.sodium === null ? "—" : `${Math.round(totals.sodium).toLocaleString()}mg`;
  $("#added-sugar-total").textContent = totals.addedSugar === null ? "—" : `${formatEstimateNumber(totals.addedSugar)}g`;
  $("#saturated-fat-total").textContent = totals.saturatedFat === null ? "—" : `${formatEstimateNumber(totals.saturatedFat)}g`;
  $("#energy-progress").value = totals.calories;
  $("#protein-progress").value = totals.protein;
  $("#carbs-progress").value = totals.carbs;
  $("#net-carbs-progress").value = totals.netCarbs;
  $("#fat-progress").value = totals.fat;
  $("#fiber-progress").value = totals.fiber;
  $("#water-progress").value = totals.water;
  $("#inflammation-progress").value = inflammation.score ?? 0;
  $("#sodium-progress").value = totals.sodium ?? 0;
  $("#added-sugar-progress").value = totals.addedSugar ?? 0;
  $("#saturated-fat-progress").value = totals.saturatedFat ?? 0;
  updateMetricBar("#energy-progress", totals.calories);
  updateMetricBar("#protein-progress", totals.protein);
  updateMetricBar("#carbs-progress", totals.carbs);
  updateMetricBar("#net-carbs-progress", totals.netCarbs);
  updateMetricBar("#fat-progress", totals.fat);
  updateMetricBar("#fiber-progress", totals.fiber);
  updateMetricBar("#water-progress", totals.water);
  updateInflammationBar(inflammation.score);
  updateMetricBar("#sodium-progress", totals.sodium ?? 0);
  updateMetricBar("#added-sugar-progress", totals.addedSugar ?? 0);
  updateMetricBar("#saturated-fat-progress", totals.saturatedFat ?? 0);
  [["#sodium-progress", totals.sodium], ["#added-sugar-progress", totals.addedSugar], ["#saturated-fat-progress", totals.saturatedFat]].forEach(([selector, value]) => {
    if (value === null) $(selector).nextElementSibling.setAttribute("aria-label", "Not estimated yet");
  });
  renderCoachFeedback(totals);
}

const metricBreakdownDefinitions = {
  calories: { title: "Energy", unit: "cal" },
  protein: { title: "Protein", unit: "g" },
  carbs: { title: "Carbohydrates / Net Carbs", unit: "g" },
  fat: { title: "Fat", unit: "g" },
  fiber: { title: "Fiber", unit: "g" },
  water: { title: "Hydration", unit: "oz" },
  inflammation: { title: "Inflammation Score™", unit: "/10" },
  sodium: { title: "Sodium", unit: "mg" },
  addedSugar: { title: "Added sugar", unit: "g" },
  saturatedFat: { title: "Saturated fat", unit: "g" }
};

function nutritionMetricValues(nutrition, metric, hydrationOunces = 0) {
  if (metric === "inflammation") return { primary: estimateInflammationScore(nutrition) ?? 0 };
  if (metric === "sodium") return { primary: Number(nutrition.sodium_mg || 0) };
  if (metric === "addedSugar") return { primary: Number(nutrition.added_sugar_g || 0) };
  if (metric === "saturatedFat") return { primary: Number(nutrition.saturated_fat_g || 0) };
  if (metric === "calories") return { primary: Number(nutrition.calories || 0) };
  if (metric === "protein") return { primary: Number(nutrition.protein_g || 0) };
  if (metric === "carbs") {
    return {
      primary: Number(nutrition.carbs_g || 0),
      secondary: typeof nutrition.net_carbs_g === "number"
        ? Number(nutrition.net_carbs_g)
        : Math.max(0, Number(nutrition.carbs_g || 0) - Number(nutrition.fiber_g || 0))
    };
  }
  if (metric === "fat") return { primary: Number(nutrition.fat_g || 0) };
  if (metric === "fiber") return { primary: Number(nutrition.fiber_g || 0) };
  return { primary: Number(hydrationOunces || nutrition.hydration_ounces || 0) };
}

function entryMetricValues(entry, metric) {
  const nutrition = entry.nutrition_estimate || {};
  const hydrationOunces = entry.kind === "hydration" ? Number(nutrition.ounces || 0) : Number(nutrition.hydration_ounces || 0);
  return nutritionMetricValues(nutrition, metric, hydrationOunces);
}

function formatEstimateNumber(value) {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toFixed(1);
}

function formatMetricContribution(metric, values) {
  if (metric === "calories") return `${Math.round(values.primary).toLocaleString()} cal`;
  if (metric === "carbs") return `${formatEstimateNumber(values.primary)}g / ${formatEstimateNumber(values.secondary)}g net`;
  if (metric === "inflammation") return `${formatEstimateNumber(values.primary)}/10`;
  return `${formatEstimateNumber(values.primary)}${metricBreakdownDefinitions[metric].unit}`;
}

function contributionEntryLabel(entry) {
  if (entry.kind === "hydration") return "Hydration";
  return mealLabels.has(entry.meal_label) ? entry.meal_label : "Meal";
}

function contributionEvidenceSource(contribution) {
  const componentEvidence = {
    nutrition_label: "Nutrition label values",
    photo_estimate: "Estimated from the meal photo",
    description_estimate: "Estimated from your written description",
    restaurant_published: "Restaurant-published nutrition",
    restaurant_estimate: "Restaurant guidance estimate",
    manual: "Values you reviewed or entered"
  };
  if (contribution.component?.evidence_type && componentEvidence[contribution.component.evidence_type]) {
    return componentEvidence[contribution.component.evidence_type];
  }
  const nutrition = contribution.entry.nutrition_estimate || {};
  if (nutrition.favorite_origin?.name || nutrition.saved_food_id) return "Your saved favorite values";
  if (nutrition.restaurant_name || nutrition.restaurant_address || nutrition.source_url) return "Restaurant guidance or published menu data";
  if (nutrition.label_detected) return "Nutrition label and the meal details you supplied";
  if (nutrition.photo_description || contribution.entry.photo_path) return "Estimated from the meal photo and your clarifying notes";
  if (contribution.entry.kind === "hydration") return "Your logged drink description";
  return "Estimated from your logged meal description";
}

function observationEntryName(entry) {
  const label = contributionEntryLabel(entry);
  const description = String(entry.description || "entry").replace(/\s+/g, " ").trim();
  const shortened = description.length > 52
    ? `${description.slice(0, 49).replace(/\s+\S*$/, "")}…`
    : description;
  return `${label} (“${shortened}”)`;
}

function contributionName(contribution) {
  return contribution.component?.name || observationEntryName(contribution.entry);
}

function contributionCalories(contribution) {
  return Number(contribution.component?.calories ?? contribution.entry.nutrition_estimate?.calories ?? 0);
}

function contributionCarbValues(contribution) {
  return contribution.component
    ? nutritionMetricValues(contribution.component, "carbs")
    : entryMetricValues(contribution.entry, "carbs");
}

function contributionKey(contribution) {
  return contribution.component
    ? `${contribution.entry.id}:${contribution.component.name}`
    : contribution.entry.id;
}

function needsIngredientItemization(entry) {
  const components = entry.nutrition_estimate?.components;
  return entry.status === "estimated" &&
    typeof entry.nutrition_estimate?.calories === "number" &&
    (!Array.isArray(components) || components.length === 0);
}

function needsMealImpactDetails(entry) {
  if (entry.kind !== "meal" || entry.status !== "estimated" || typeof entry.nutrition_estimate?.calories !== "number") return false;
  const components = Array.isArray(entry.nutrition_estimate?.components) ? entry.nutrition_estimate.components : [];
  return estimateInflammationScore(entry.nutrition_estimate) === null ||
    components.length === 0 ||
    components.some((component) => estimateInflammationScore(component) === null);
}

function buildMetricContributions(metric) {
  if (metric === "inflammation") {
    return state.entries
      .filter((entry) => entry.kind === "meal" && entry.status !== "pending_estimate")
      .map((entry) => ({
        entry,
        component: null,
        displayName: String(entry.description || "Meal"),
        sourceLabel: contributionEntryLabel(entry),
        values: { primary: estimateInflammationScore(entry.nutrition_estimate || {}) ?? 0 }
      }))
      .filter(({ values }) => values.primary > 0)
      .sort((left, right) => right.values.primary - left.values.primary);
  }
  return state.entries
    .filter((entry) => entry.status !== "pending_estimate")
    .flatMap((entry) => {
      const nutrition = entry.nutrition_estimate || {};
      const components = Array.isArray(nutrition.components)
        ? nutrition.components.filter((component) => component && typeof component.name === "string")
        : [];
      if (metric !== "calories" && components.length) {
        const rows = components.map((component) => ({
          entry,
          component,
          displayName: component.name,
          sourceLabel: contributionEntryLabel(entry),
          values: nutritionMetricValues(component, metric)
        }));
        const entryTotals = entryMetricValues(entry, metric);
        const componentTotals = rows.reduce((sum, row) => {
          sum.primary += row.values.primary;
          sum.secondary += Number(row.values.secondary || 0);
          return sum;
        }, { primary: 0, secondary: 0 });
        if (metric === "carbs") {
          const rawValues = rows.map((row) => ({
            total: Math.max(0, Number(row.values.primary || 0)),
            net: Math.max(0, Number(row.values.secondary || 0))
          }));
          const targetTotal = Math.max(0, Number(entryTotals.primary || 0));
          const targetNet = Math.min(targetTotal, Math.max(0, Number(entryTotals.secondary || 0)));
          const totalScale = componentTotals.primary > 0 ? targetTotal / componentTotals.primary : 0;
          rows.forEach((row, index) => {
            const raw = rawValues[index];
            const netFraction = raw.total > 0 ? Math.min(1, raw.net / raw.total) : 0;
            row.values.primary = raw.total * totalScale;
            row.values.secondary = row.values.primary * netFraction;
          });
          const initialNet = rows.reduce((sum, row) => sum + Number(row.values.secondary || 0), 0);
          if (initialNet > targetNet && initialNet > 0) {
            const netScale = targetNet / initialNet;
            rows.forEach((row) => { row.values.secondary *= netScale; });
          } else if (initialNet < targetNet) {
            const remainingNet = targetNet - initialNet;
            const totalHeadroom = rows.reduce(
              (sum, row) => sum + Math.max(0, row.values.primary - Number(row.values.secondary || 0)),
              0
            );
            if (totalHeadroom > 0) {
              rows.forEach((row) => {
                const headroom = Math.max(0, row.values.primary - Number(row.values.secondary || 0));
                row.values.secondary += remainingNet * (headroom / totalHeadroom);
              });
            }
          }
        } else if (componentTotals.primary > 0) {
          const primaryScale = entryTotals.primary / componentTotals.primary;
          rows.forEach((row) => { row.values.primary *= primaryScale; });
        }
        return rows;
      }
      if (metric === "water" && entry.kind === "hydration" && !needsIngredientItemization(entry)) {
        return [{
          entry,
          component: null,
          displayName: String(entry.description || "Drink"),
          sourceLabel: "Hydration",
          values: entryMetricValues(entry, metric)
        }];
      }
      if (metric !== "calories") return [];
      return [{
        entry,
        component: null,
        displayName: String(entry.description || "Entry"),
        sourceLabel: contributionEntryLabel(entry),
        values: entryMetricValues(entry, metric)
      }];
    })
    .filter(({ values }) => values.primary > 0 || Number(values.secondary || 0) > 0)
    .sort((a, b) => b.values.primary - a.values.primary);
}

function dailyMetricTotals(metric) {
  if (metric === "inflammation") {
    return { primary: summarizeInflammationEntries(state.entries).score ?? 0, secondary: 0 };
  }
  return state.entries
    .filter((entry) => entry.status !== "pending_estimate")
    .reduce((sum, entry) => {
      const values = entryMetricValues(entry, metric);
      sum.primary += values.primary;
      sum.secondary += Number(values.secondary || 0);
      return sum;
    }, { primary: 0, secondary: 0 });
}

function metricStandoutObservation(metric, contributions, totals) {
  if (!contributions.length) return "Log an entry with an estimate to see a useful observation here.";
  const largest = contributions[0];
  const largestName = contributionName(largest);
  if (metric === "inflammation") return `${largestName} had today’s highest estimated food-pattern impact at ${formatEstimateNumber(largest.values.primary)}/10. This score describes the logged meal pattern; it is not a medical test or diagnosis.`;
  if (metric === "protein") {
    const efficiencyCandidates = contributions.filter((contribution) => contribution.values.primary > 0 && contributionCalories(contribution) > 0);
    const efficient = efficiencyCandidates.sort((a, b) => {
      const aDensity = a.values.primary / contributionCalories(a);
      const bDensity = b.values.primary / contributionCalories(b);
      return bDensity - aDensity;
    })[0] || largest;
    const calories = contributionCalories(efficient);
    const density = calories > 0 ? Math.round((efficient.values.primary / calories) * 100) : 0;
    const carbContext = state.netCarbGoal
      ? ` It also had about ${Math.round(contributionCarbValues(efficient).secondary || 0)}g net carbs against your ${state.netCarbGoal}g daily ceiling.`
      : "";
    const efficiencyNote = contributionKey(efficient) === contributionKey(largest)
      ? `It was also your most protein-efficient entry at roughly ${density}g per 100 calories.`
      : `${contributionName(efficient)} was the most protein-efficient source at roughly ${density}g per 100 calories.`;
    return `${largestName} contributed the most protein at about ${Math.round(largest.values.primary)}g. ${efficiencyNote}${carbContext}`;
  }
  if (metric === "carbs") {
    const netTotal = Math.round(totals.secondary || 0);
    const goalContext = state.netCarbGoal
      ? ` Your estimated ${netTotal}g net total uses about ${Math.round((netTotal / state.netCarbGoal) * 100)}% of your ${state.netCarbGoal}g daily ceiling.`
      : "";
    return `${largestName} contributed the most carbohydrates: about ${Math.round(largest.values.primary)}g total and ${Math.round(largest.values.secondary || 0)}g net.${goalContext}`;
  }
  if (metric === "fiber") return `${largestName} was your strongest fiber contributor at about ${Math.round(largest.values.primary)}g.`;
  if (metric === "water") return `${largestName} contributed the most logged hydration at about ${Math.round(largest.values.primary)} oz.`;
  if (metric === "fat") return `${largestName} contributed the most fat at about ${Math.round(largest.values.primary)}g. Fat quality depends on the ingredients and preparation, so the total alone does not label it a good or bad choice.`;
  if (metric === "sodium") return `${largestName} contributed the most estimated sodium at about ${Math.round(largest.values.primary).toLocaleString()}mg. Restaurant meals and sauces can vary substantially, so label or published values are strongest.`;
  if (metric === "addedSugar") return `${largestName} contributed the most estimated added sugar at about ${formatEstimateNumber(largest.values.primary)}g.`;
  if (metric === "saturatedFat") return `${largestName} contributed the most estimated saturated fat at about ${formatEstimateNumber(largest.values.primary)}g.`;
  return `${largestName} contributed the most energy at about ${Math.round(largest.values.primary).toLocaleString()} calories. Calories show quantity of energy—not nutrition quality by themselves.`;
}

let metricBreakdownReturnFocus = null;
let metricBreakdownCurrentMetric = null;
let ingredientItemizationFailed = false;

function renderMetricBreakdown(metric) {
  const definition = metricBreakdownDefinitions[metric];
  if (!definition) return;
  const contributions = buildMetricContributions(metric);
  const totals = dailyMetricTotals(metric);
  const pendingCount = state.entries.filter((entry) => entry.status === "pending_estimate").length;
  const unitemizedCount = metric === "calories" || metric === "inflammation" ? 0 : state.entries.filter(needsIngredientItemization).length;
  $("#metric-breakdown-title").textContent = definition.title;
  const detailStatus = [
    pendingCount ? `${pendingCount} pending ${pendingCount === 1 ? "estimate is" : "estimates are"} not included yet.` : "",
    unitemizedCount
      ? ingredientItemizationFailed
        ? `Ingredient detail could not be added yet for ${unitemizedCount} older ${unitemizedCount === 1 ? "entry" : "entries"}.`
        : `Ingredient detail is being added for ${unitemizedCount} older ${unitemizedCount === 1 ? "entry" : "entries"}.`
      : ""
  ].filter(Boolean).join(" ");
  $("#metric-breakdown-summary").textContent = totals.primary > 0 || totals.secondary > 0
    ? metric === "inflammation"
      ? `${formatMetricContribution(metric, totals)} estimated from ${contributions.length} scored ${contributions.length === 1 ? "meal" : "meals"}. Lower scores indicate a more anti-inflammatory food pattern.`
      : metric === "calories"
      ? `${formatMetricContribution(metric, totals)} across ${contributions.length} estimated ${contributions.length === 1 ? "entry" : "entries"}.${detailStatus ? ` ${detailStatus}` : ""}`
      : `${formatMetricContribution(metric, totals)} estimated daily total. Ingredient sources are itemized below.${detailStatus ? ` ${detailStatus}` : ""}`
    : `No estimated ${definition.title.toLowerCase()} sources are available yet.${detailStatus ? ` ${detailStatus}` : ""}`;
  $("#metric-contribution-list").innerHTML = contributions.length
    ? contributions.map(({ entry, component, displayName, sourceLabel, values }) => {
      const share = metric === "inflammation"
        ? Math.round((values.primary / 10) * 100)
        : totals.primary > 0 ? Math.min(100, Math.round((values.primary / totals.primary) * 100)) : 0;
      const shareLabel = metric === "inflammation" ? inflammationBand(values.primary).label : `${share}% of this total`;
      const evidenceSource = contributionEvidenceSource({ entry, component });
      return `<li>
        <span class="metric-contribution-main"><strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(sourceLabel)} · ${escapeHtml(shareLabel)}</small></span>
        <span class="metric-contribution-value">${escapeHtml(formatMetricContribution(metric, values))}</span>
        <span class="metric-contribution-bar" aria-hidden="true"><span style="width:${share}%"></span></span>
        <small class="metric-contribution-source"><b>Source:</b> ${escapeHtml(evidenceSource)}</small>
      </li>`;
    }).join("")
    : `<li class="metric-contribution-empty">${unitemizedCount ? "Adding ingredient details…" : "Nothing to break down yet."}</li>`;
  $("#metric-standout").hidden = !contributions.length;
  if (contributions.length) $("#metric-standout-copy").textContent = metricStandoutObservation(metric, contributions, totals);
}

function openMetricBreakdown(metric, trigger) {
  if (!metricBreakdownDefinitions[metric]) return;
  metricBreakdownCurrentMetric = metric;
  renderMetricBreakdown(metric);
  metricBreakdownReturnFocus = trigger;
  $("#metric-breakdown").hidden = false;
  document.body.classList.add("modal-open");
  $(".metric-breakdown-close").focus();
}

function closeMetricBreakdown() {
  if ($("#metric-breakdown").hidden) return;
  $("#metric-breakdown").hidden = true;
  document.body.classList.remove("modal-open");
  showAppView("today", { focus: false });
  metricBreakdownReturnFocus?.focus();
  metricBreakdownReturnFocus = null;
  metricBreakdownCurrentMetric = null;
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
    if (typeof nutrition.sodium_mg === "number") sum.sodium = Number(sum.sodium || 0) + nutrition.sodium_mg;
    if (typeof nutrition.added_sugar_g === "number") sum.addedSugar = Number(sum.addedSugar || 0) + nutrition.added_sugar_g;
    if (typeof nutrition.saturated_fat_g === "number") sum.saturatedFat = Number(sum.saturatedFat || 0) + nutrition.saturated_fat_g;
    return sum;
  }, { calories: 0, protein: 0, carbs: 0, netCarbs: 0, fat: 0, fiber: 0, water: 0 });
  state.currentTotals = totals;
  const title = $("#coach-feedback-title");
  const support = $("#coach-feedback-support");
  const suggestion = $("#coach-feedback-suggestion");
  const personalizeButton = $("#personalize-feedback");
  if (!title || !support || !suggestion || !personalizeButton) return;
  personalizeButton.hidden = true;
  const personalTitle = (message) => {
    if (!state.preferredName) return message;
    return `${state.preferredName}, ${message.charAt(0).toLocaleLowerCase()}${message.slice(1)}`;
  };

  const pending = state.entries.some((entry) => entry.status === "pending_estimate");
  if (!state.entries.length) {
    title.textContent = personalTitle("Ready when you are.");
    support.textContent = "No pressure to make today perfect. Log your next meal or drink and we’ll take it one choice at a time.";
    suggestion.textContent = "Start with what you actually had—close enough is good enough.";
    return;
  }
  if (pending) {
    title.textContent = personalTitle("Nice work logging it.");
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
  const inflammationFocus = preferences.has("low inflammation") || preferences.has("reduce inflammation");
  const inflammationSummary = summarizeInflammationEntries(state.entries);
  const everyMacro = state.trackingDetail === "Every macro";
  const basicsOnly = state.trackingDetail === "Just the basics";
  const fiberFocus = !basicsOnly || ["mediterranean", "dash", "vegetarian", "vegan", "low inflammation", "reduce inflammation", "better blood sugar", "heart healthy"].some((value) => preferences.has(value));
  const hydrationFocus = !basicsOnly || totals.water > 0 || state.uses.includes("Hydration tracking") || state.reminders.includes("Water");
  const hydrationGuidance = adaptiveHydrationGuidance({ hydrationOunces: totals.water, hydrationGoalOunces: state.waterGoal, sodiumMg: totals.sodium, sodiumGoalMg: state.sodiumGoal, targetSource: state.hydrationTargetSource });
  const preferenceLabel = preferences.has("keto") ? "keto" : preferences.has("better blood sugar") && !preferences.has("low carb") ? "blood-sugar-aware" : "low-carb";
  const affirmationPools = {
    supportive: [
      "You’re paying attention, and that counts.",
      "Small check-ins can make a real difference.",
      "You’re giving yourself useful information.",
      "A little consistency goes a long way.",
      "You’re keeping your goals in view.",
      "This is practical progress.",
      "You’re learning what works for you.",
      "Each honest entry adds clarity.",
      "You’re building a clearer picture.",
      "You’re making room for better choices.",
      "Today’s effort is worth noticing.",
      "You’re staying connected to your goals.",
      "You’re taking this one choice at a time.",
      "Your follow-through is taking shape.",
      "You’re showing up for yourself today.",
      "This check-in is a useful step."
    ],
    direct: [
      "You’re keeping the day accountable.",
      "The picture is getting clearer.",
      "Today’s log gives you something to act on.",
      "You’re staying on top of the details.",
      "The numbers are ready to work for you.",
      "You’ve made today visible.",
      "This is information you can use.",
      "You’re keeping your goals measurable.",
      "Today’s choices are coming into focus.",
      "You’re building a useful record.",
      "The check-in is done; now use it.",
      "You’re keeping momentum practical.",
      "The log is doing its job.",
      "You’ve got a clear read on today.",
      "This is a solid point to adjust from.",
      "You’re turning choices into usable data."
    ],
    data_focused: [
      "Your daily picture is becoming more complete.",
      "You’re building a useful baseline.",
      "Today’s data is taking shape.",
      "Each entry improves the pattern.",
      "You’re adding useful context to the numbers.",
      "Your trends start with check-ins like this.",
      "The record is getting more informative.",
      "You’re creating data you can learn from.",
      "Today’s totals have useful context.",
      "You’re making your progress measurable.",
      "Another data point is in place.",
      "Your choices are becoming easier to compare.",
      "You’re building a clearer trend line.",
      "The day is becoming easier to evaluate.",
      "You’re capturing the details that matter.",
      "This check-in strengthens the bigger picture."
    ],
    playful: [
      "Nice—today’s picture is coming together.",
      "You’ve put another useful clue on the board.",
      "A small check-in, a clearer day.",
      "The log is earning its keep.",
      "You’re giving Future You something useful.",
      "Another piece of the puzzle is in place.",
      "You’ve got the day talking.",
      "That’s one more menu mystery solved.",
      "Your food story is getting clearer.",
      "Tiny check-in, useful payoff.",
      "The numbers have entered the chat.",
      "You’ve kept the day from flying under the radar.",
      "Another choice, now accounted for.",
      "You’re making the invisible visible.",
      "The dashboard has something useful to say.",
      "You’ve added a little more clarity to the plate."
    ]
  };
  const now = new Date();
  const localDay = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  const userOffset = [...user.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const affirmations = affirmationPools[state.tone] || affirmationPools.supportive;
  title.textContent = personalTitle(affirmations[(localDay + userOffset) % affirmations.length]);
  const summaryMetrics = [
    `${Math.round(totals.calories).toLocaleString()} calories`,
    `${Math.round(totals.protein)}g protein`
  ];
  if (carbFocus || everyMacro) summaryMetrics.push(`${Math.round(totals.carbs)}g total/${Math.round(totals.netCarbs)}g net carbs`);
  if (everyMacro || preferences.has("keto")) summaryMetrics.push(`${Math.round(totals.fat)}g fat`);
  if (fiberFocus) summaryMetrics.push(`${Math.round(totals.fiber)}g fiber`);
  if (hydrationFocus) summaryMetrics.push(`${Math.round(totals.water)} oz hydration`);
  if (inflammationFocus && inflammationSummary.score !== null) {
    summaryMetrics.push(`Inflammation Score™ ${formatEstimateNumber(inflammationSummary.score)}/10 (${inflammationBand(inflammationSummary.score).label.toLowerCase()})`);
  }
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
    suggestion.textContent = "You’re above your calorie target, but one day is information—not failure. Choose a satisfying protein-and-produce option if you’re hungry, and keep fluids within your saved hydration target.";
  } else if (waterPercent < 0.35 && new Date().getHours() >= 12) {
    suggestion.textContent = `Hydration is the clearest opportunity right now. ${hydrationGuidance.message}`;
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
  if (inflammationFocus) {
    if (inflammationSummary.score === null) {
      suggestion.textContent += " Your inflammation-focused preference is saved; scored meals will include the Inflammation Score™ and food-by-food context.";
    } else {
      const score = inflammationSummary.score;
      const highestNutrition = inflammationSummary.highest?.entry?.nutrition_estimate || {};
      const watchFoods = (Array.isArray(highestNutrition.components) ? highestNutrition.components : [])
        .filter((component) => inflammationImpact(component.inflammation_impact) === "watch")
        .sort((left, right) => Number(right.inflammation_score || 0) - Number(left.inflammation_score || 0))
        .slice(0, 2)
        .map((component) => component.name)
        .filter(Boolean);
      const foodContext = watchFoods.length
        ? ` The main items worth watching were ${new Intl.ListFormat(undefined, { style: "long", type: "conjunction" }).format(watchFoods)}.`
        : "";
      if (score <= 3) {
        suggestion.textContent += " Your logged meals currently lean toward the lower end of the Inflammation Score™ scale. Keep the whole-food pattern working for you.";
      } else if (score <= 6) {
        suggestion.textContent += ` Your inflammation-focused pattern is mixed so far.${foodContext} Open a meal's details to see the helpful and worth-watching foods.`;
      } else {
        suggestion.textContent += ` Your Inflammation Score™ is toward the higher end today.${foodContext} A useful next choice is minimally processed protein, colorful non-starchy vegetables, and a clearly identified cooking oil or sauce.`;
      }
    }
  }
  if (hydrationFocus && hydrationGuidance.sodiumHigh && !suggestion.textContent.includes("Estimated sodium is at or above")) {
    suggestion.textContent += ` ${hydrationGuidance.message}`;
  }
  if (netCarbGuardrail) suggestion.textContent += ` ${netCarbGuardrail}`;
}

const reportPeriods = {
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
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - (settings.days - 1));
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
  const entriesByDay = new Map();
  entries.forEach((entry) => {
    const key = reportDateKey(entry.occurred_at);
    if (!entriesByDay.has(key)) entriesByDay.set(key, []);
    entriesByDay.get(key).push(entry);
  });
  const pendingDays = [...entriesByDay.values()].filter((dayEntries) => dayEntries.some((entry) => entry.status === "pending_estimate"));
  const includedDayRecords = [...entriesByDay.entries()].filter(([, dayEntries]) => !dayEntries.some((entry) => entry.status === "pending_estimate"));
  const includedDays = includedDayRecords.map(([, dayEntries]) => dayEntries);
  const includedEntries = includedDays.flat();
  const inflammation = summarizeInflammationReport(includedEntries, reportDateKey);
  const totals = includedEntries.reduce((sum, entry) => {
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
  }, { calories: 0, protein: 0, carbs: 0, netCarbs: 0, fat: 0, fiber: 0, water: 0, sodium: null, addedSugar: null, saturatedFat: null, meals: 0, hydrationEntries: 0 });
  const dailySeries = includedDayRecords.map(([date, dayEntries]) => {
    const values = dayEntries.reduce((sum, entry) => {
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
      if (typeof nutrition.sodium_mg === "number") sum.sodium = Number(sum.sodium || 0) + nutrition.sodium_mg;
      if (typeof nutrition.added_sugar_g === "number") sum.addedSugar = Number(sum.addedSugar || 0) + nutrition.added_sugar_g;
      if (typeof nutrition.saturated_fat_g === "number") sum.saturatedFat = Number(sum.saturatedFat || 0) + nutrition.saturated_fat_g;
      return sum;
    }, { calories: 0, protein: 0, carbs: 0, netCarbs: 0, fat: 0, fiber: 0, water: 0, sodium: null, addedSugar: null, saturatedFat: null });
    return { date, ...values };
  });
  return {
    totals,
    includedEntries,
    dailySeries,
    averagedDays: includedDays.length,
    totalLoggedDays: entriesByDay.size,
    pendingDays: pendingDays.length,
    inflammation
  };
}

const reportChartDefinitions = [
  { key: "calories", label: "Calories", unit: "", goal: () => state.calorieGoal },
  { key: "protein", label: "Protein", unit: "g", goal: () => state.proteinGoal },
  { key: "carbs", label: "Total carbs", unit: "g", goal: () => null },
  { key: "netCarbs", label: "Net carbs", unit: "g", goal: () => state.netCarbGoal || null },
  { key: "fat", label: "Fat", unit: "g", goal: () => null },
  { key: "fiber", label: "Fiber", unit: "g", goal: () => state.fiberGoal },
  { key: "water", label: "Hydration", unit: "oz", goal: () => state.waterGoal }
  ,{ key: "sodium", label: "Sodium", unit: "mg", goal: () => state.sodiumGoal, optional: true }
  ,{ key: "addedSugar", label: "Added sugar", unit: "g", goal: () => state.addedSugarGoal, optional: true }
  ,{ key: "saturatedFat", label: "Saturated fat", unit: "g", goal: () => state.saturatedFatGoal, optional: true }
];

function reportLineChart(definition, dailySeries) {
  if (!dailySeries.length) return "";
  const width = 360;
  const height = 128;
  const left = 10;
  const right = 10;
  const top = 12;
  const bottom = 18;
  const values = dailySeries.map((day) => Math.max(0, Number(day[definition.key] || 0)));
  const goal = Number(definition.goal());
  const hasGoal = Number.isFinite(goal) && goal > 0;
  const maximum = Math.max(...values, hasGoal ? goal : 0, 1) * 1.08;
  const x = (index) => dailySeries.length === 1
    ? width / 2
    : left + (index / (dailySeries.length - 1)) * (width - left - right);
  const y = (value) => height - bottom - (Math.max(0, value) / maximum) * (height - top - bottom);
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const targetLine = hasGoal
    ? `<line class="report-goal-line" x1="${left}" y1="${y(goal).toFixed(1)}" x2="${width - right}" y2="${y(goal).toFixed(1)}"><title>Daily goal ${Math.round(goal)}${definition.unit}</title></line>`
    : "";
  const lastIndex = values.length - 1;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const excessPercent = hasGoal && average > goal ? Math.min(35, ((average - goal) / goal) * 100) : 0;
  const goalPercent = hasGoal ? (average > goal ? 100 - excessPercent : Math.min(100, (average / goal) * 100)) : 0;
  const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const firstDate = dateFormat.format(new Date(`${dailySeries[0].date}T12:00:00`));
  const lastDate = dateFormat.format(new Date(`${dailySeries.at(-1).date}T12:00:00`));
  const spokenValues = values.map((value, index) => `${dailySeries[index].date}: ${Math.round(value)}${definition.unit}`).join(", ");
  return `<article class="report-chart-card ${hasGoal ? "has-goal" : "no-goal"}">
    <div class="report-metric-heading"><strong>${definition.label}</strong><span>${Math.round(average).toLocaleString()}${definition.unit}${hasGoal ? ` / ${Math.round(goal).toLocaleString()}${definition.unit}` : " average"}</span></div>
    ${hasGoal ? `<span class="report-average-track ${average > goal ? "is-over" : ""}" aria-label="Average ${Math.round(average)}${definition.unit} out of ${Math.round(goal)}${definition.unit}"><i class="report-average-fill" style="width:${goalPercent.toFixed(1)}%"></i><i class="report-average-excess" style="width:${excessPercent.toFixed(1)}%"></i></span>` : ""}
    <div class="report-trend-label"><span>Daily progression</span><small>${escapeHtml(firstDate)}–${escapeHtml(lastDate)}</small></div>
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(`${definition.label} by logged day. ${spokenValues}`)}">
      <line class="report-chart-baseline" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"></line>
      ${targetLine}
      <polyline class="report-chart-line" points="${points}"></polyline>
      <circle class="report-chart-point" cx="${x(lastIndex).toFixed(1)}" cy="${y(values[lastIndex]).toFixed(1)}" r="4"></circle>
    </svg>
  </article>`;
}

function renderReportCharts(dailySeries) {
  const root = $("#report-charts");
  if (!root) return;
  root.innerHTML = dailySeries.length
    ? reportChartDefinitions
      .filter((definition) => !definition.optional || (state.optionalMetrics.includes(definition.key) && dailySeries.some((day) => day[definition.key] !== null)))
      .map((definition) => reportLineChart(definition, dailySeries)).join("")
    : '<p class="report-chart-empty">Log at least one complete day to see progression lines.</p>';
}

function weightReportMetrics(range, weightEntries) {
  const startKey = localDateValue(range.start);
  const endKey = localDateValue(range.end);
  const ordered = [...weightEntries].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const throughEnd = ordered.filter((entry) => entry.measured_on <= endKey);
  const periodEntries = throughEnd.filter((entry) => entry.measured_on >= startKey);
  const starting = ordered[0] || null;
  const latest = throughEnd.at(-1) || null;
  const beforePeriod = throughEnd.filter((entry) => entry.measured_on < startKey).at(-1) || null;
  const periodAnchor = beforePeriod || periodEntries[0] || null;
  if (!latest) return { metrics: [] };

  const metrics = [
    ["Starting weight", formatWeight(starting.weight_kg, state.unitSystem)],
    ["Latest weight", formatWeight(latest.weight_kg, state.unitSystem)],
    ["Change from start", formatWeightChange(Number(latest.weight_kg) - Number(starting.weight_kg), state.unitSystem)]
  ];
  if (periodEntries.length && periodAnchor) metrics.push([`${range.label} weight change`, formatWeightChange(Number(latest.weight_kg) - Number(periodAnchor.weight_kg), state.unitSystem)]);
  if (state.goalWeightKg) {
    metrics.push(["Goal weight", formatWeight(state.goalWeightKg, state.unitSystem)]);
    metrics.push(["Distance to goal", formatWeight(Math.abs(Number(latest.weight_kg) - state.goalWeightKg), state.unitSystem)]);
  }
  const bmi = estimatedAdultBmi({ weightKg: latest.weight_kg, heightCm: state.heightCm, age: state.age, enabled: state.trackBmi, override: latest.bmi_override });
  if (bmi) metrics.push([bmi.source === "entered" ? "Entered BMI" : "Estimated BMI", bmi.value.toFixed(1)]);
  return { metrics };
}

function renderReport(period, range, entries, weightEntries = state.weightEntries) {
  const { totals, includedEntries, dailySeries, averagedDays, totalLoggedDays, pendingDays, inflammation } = summarizeReport(entries);
  const divisor = Math.max(1, averagedDays);
  const averageLabel = " average/included day";
  const averageValue = (value, suffix = "") => averagedDays ? `${Math.round(value / divisor).toLocaleString()}${suffix}` : "No data";
  const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  const rangeLabel = period === "daily"
    ? dateFormat.format(range.start)
    : `${dateFormat.format(range.start)}–${dateFormat.format(range.end)}`;
  const weightSummary = weightReportMetrics(range, weightEntries);
  const inflammationValue = inflammation.score === null
    ? "No scored meals"
    : `${inflammation.score.toFixed(1)}/10 · ${inflammationBand(inflammation.score).label}`;
  const optionalReportMetrics = [
    state.optionalMetrics.includes("sodium") ? [`Sodium${averageLabel}`, totals.sodium === null ? "Not estimated" : averageValue(totals.sodium, "mg")] : null,
    state.optionalMetrics.includes("addedSugar") ? [`Added sugar${averageLabel}`, totals.addedSugar === null ? "Not estimated" : averageValue(totals.addedSugar, "g")] : null,
    state.optionalMetrics.includes("saturatedFat") ? [`Saturated fat${averageLabel}`, totals.saturatedFat === null ? "Not estimated" : averageValue(totals.saturatedFat, "g")] : null
  ].filter(Boolean);
  const metrics = [
    ["Entries included", includedEntries.length.toLocaleString()],
    ["Days averaged", averagedDays.toLocaleString()],
    [`Calories${averageLabel}`, averageValue(totals.calories)],
    [`Protein${averageLabel}`, averageValue(totals.protein, "g")],
    [`Total/net carbs${averageLabel}`, averagedDays ? `${Math.round(totals.carbs / divisor)}g/${Math.round(totals.netCarbs / divisor)}g` : "No data"],
    [`Fat${averageLabel}`, averageValue(totals.fat, "g")],
    [`Fiber${averageLabel}`, averageValue(totals.fiber, "g")],
    [`Hydration${averageLabel}`, averageValue(totals.water, "oz")],
    ["Inflammation Score™ average/scored day", inflammationValue],
    ...optionalReportMetrics,
    ...weightSummary.metrics
  ];
  const inflammationCoverage = inflammation.scoredMeals
    ? ` The Inflammation Score™ average uses ${inflammation.scoredMeals} scored ${inflammation.scoredMeals === 1 ? "meal" : "meals"} across ${inflammation.scoredDays} ${inflammation.scoredDays === 1 ? "day" : "days"}.${inflammation.unscoredMeals ? ` ${inflammation.unscoredMeals} earlier ${inflammation.unscoredMeals === 1 ? "meal does" : "meals do"} not yet have an impact score and were not treated as zero.` : ""}`
    : " No meals in this period include an Inflammation Score™ yet; missing scores are never treated as zero.";
  const completeness = `Average based on ${averagedDays} included ${averagedDays === 1 ? "day" : "days"}. ${totalLoggedDays} of ${range.days} completed calendar days contained entries.${pendingDays ? ` ${pendingDays} ${pendingDays === 1 ? "day was" : "days were"} excluded because a nutrition estimate is still pending.` : ""}${inflammationCoverage} Some logged days may be incomplete; entering every meal and drink provides more accurate averages and long-term trends.`;
  $("#report-range").textContent = rangeLabel;
  $("#report-period-title").textContent = `${range.label} report`;
  renderReportCharts(dailySeries);
  $("#report-metrics").innerHTML = metrics.map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("");
  $("#report-output").hidden = false;
  $("#report-completeness").textContent = completeness;
  $("#report-status").textContent = entries.length || weightSummary.metrics.length
    ? `${range.label} report generated from your protected nutrition and weight records.`
    : `No ledger or weight entries were found for this ${range.label.toLowerCase()} period.`;
  latestReport = { period, range, metrics, entries: includedEntries.length, loggedDays: averagedDays, completeness };
}

async function generateReport(period, button) {
  const range = reportRange(period);
  const buttons = $$("[data-report-period]");
  buttons.forEach((item) => {
    const isActive = item === button;
    item.disabled = true;
    item.classList.toggle("is-active", isActive);
    item.setAttribute("aria-pressed", String(isActive));
  });
  $("#report-status").textContent = `Generating ${range.label.toLowerCase()} report...`;
  try {
    const entries = await loadReportEntries(range.start, range.end);
    renderReport(period, range, entries, state.weightEntries);
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
    latestReport.completeness,
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

$("#weight-date").value = localDateValue();
$("#weight-date").max = localDateValue();

$("#weight-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#save-weight");
  const status = $("#weight-status");
  const measuredOn = $("#weight-date").value;
  const unitSystem = $("#weight-unit").value;
  const weightKg = weightToKg($("#weight-value").value, unitSystem);
  const bmiOverrideText = $("#weight-bmi-override").value.trim();
  if (!measuredOn || measuredOn > localDateValue()) {
    status.textContent = "Choose today or an earlier measurement date.";
    return;
  }
  if (!weightKg || weightKg < 20 || weightKg > 500) {
    status.textContent = "Enter a weight between 20 and 500 kg (44 and 1,102 lb).";
    return;
  }
  button.disabled = true;
  status.textContent = "Saving your private weight record...";
  const payload = {
    user_id: user.id,
    measured_on: measuredOn,
    weight_kg: Math.round(weightKg * 100) / 100,
    source: $("#weight-source").value,
    bmi_override: bmiOverrideText ? Number(bmiOverrideText) : null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("weight_entries").upsert(payload, { onConflict: "user_id,measured_on" });
  button.disabled = false;
  if (error) {
    status.textContent = error.message;
    return;
  }
  $("#weight-value").value = "";
  $("#weight-bmi-override").value = "";
  status.textContent = `Saved ${formatWeight(weightKg, unitSystem)} for ${measuredOn}.`;
  await loadWeightEntries();
  if (latestReport) {
    const active = document.querySelector("[data-report-period].is-active") || document.querySelector('[data-report-period="weekly"]');
    await generateReport(active.dataset.reportPeriod, active);
  }
});

$("#weight-history-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-weight]");
  if (!button || !confirm("Delete this weight measurement?")) return;
  button.disabled = true;
  const { error } = await supabase.from("weight_entries").delete().eq("id", button.dataset.deleteWeight).eq("user_id", user.id);
  if (error) {
    toast(error.message);
    button.disabled = false;
    return;
  }
  $("#weight-status").textContent = "Weight measurement deleted.";
  await loadWeightEntries();
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

$("#photo-input").addEventListener("change", (event) => {
  const file = event.target.files[0] || null;
  const validationMessage = mealPhotoValidationMessage(file);
  if (validationMessage) {
    state.photo = null;
    event.target.value = "";
    toast(validationMessage);
    return;
  }
  state.photo = file;
  if (file) toast("Meal or label photo ready. This can be the before image if you later photograph leftovers.");
});

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
    status.textContent = "Location is not supported in this browser. Begin the description with your ZIP or ZIP+4, then the restaurant or request, and retry.";
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
        1: "Location was not shared by the browser. Begin the description with your ZIP or ZIP+4, then the restaurant or request, and retry.",
        2: "Your current area could not be determined. Begin the description with your ZIP or ZIP+4 and retry.",
        3: "Location took too long. Begin the description with your ZIP or ZIP+4 and retry."
      };
      status.textContent = messages[error.code] || "Location could not be used. Begin the description with your ZIP or ZIP+4 and retry.";
      button.disabled = false;
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
  );
});

$("#clear-restaurant-location").addEventListener("click", clearRestaurantLocation);

$("#coach-photo-input").addEventListener("change", (event) => {
  const file = event.target.files[0] || null;
  if (mealPhotoValidationMessage(file)) {
    clearCoachPhoto();
    toast("Use a JPG, PNG, WebP, or GIF photo no larger than 8 MB.");
    return;
  }
  state.coachPhoto = file;
  $("#coach-photo-name").textContent = file ? `${file.name} ready` : "No photo selected.";
  if (file) toast("Fridge or pantry photo ready for private analysis.");
});

function openCoachAction(mode) {
  showAppSubview("plan", "tool");
  state.coachMode = mode;
  state.restaurantPlan = null;
  const restaurantMode = mode === "restaurant";
  const recipeMode = mode === "recipe";
  if (restaurantMode || recipeMode) clearCoachPhoto(); else clearRestaurantLocation();
  $("#coach-action-title").textContent = restaurantMode ? "Restaurant Mode" : recipeMode ? "Recreate a Favorite Meal · Beta" : "Plan Your Next Meal";
  $("#coach-action-prompt").textContent = restaurantMode
    ? "For local results, start with your ZIP or ZIP+4. Then enter a restaurant, menu item, or what you are considering ordering."
    : recipeMode
      ? "Enter the restaurant and meal name, paste a menu description, describe a favorite meal, or choose wording from a saved favorite."
      : "Describe what you have, or add a fridge or pantry photo. Include your available time or what sounds good.";
  $("#coach-action-context").placeholder = restaurantMode
    ? "e.g. 46140-6509 Restaurant Name or meal description"
    : recipeMode
      ? "e.g. grilled chicken with garlic cream sauce and roasted vegetables"
      : "e.g. 30 minutes, cooking for two, something low carb";
  $("#coach-photo-field").hidden = restaurantMode || recipeMode;
  $("#restaurant-location-field").hidden = !restaurantMode;
  $("#recipe-options").hidden = !recipeMode;
  if (recipeMode) {
    const favoriteSelect = $("#recipe-saved-favorite");
    const favorites = state.savedFoodsApi?.listRecipeFavorites?.() || [];
    favoriteSelect.replaceChildren(new Option("Describe or paste a meal instead", ""), ...favorites.map((food) => new Option(food.label, food.description)));
  }
  $("#run-coach-action").textContent = restaurantMode ? "Get ordering guidance" : recipeMode ? "Create my recipe" : "Plan my meal";
  $("#coach-action-form").hidden = false;
  $("#coach-action-status").hidden = true;
  $("#coach-action-result").hidden = true;
  $("#coach-action-result").replaceChildren();
  $("#coach-action-context").focus();
}

$("#recipe-saved-favorite").addEventListener("change", (event) => {
  if (event.target.value) $("#coach-action-context").value = event.target.value;
});

function renderRecipePlan(recipe, savedRecipeId, cache) {
  if (!recipe || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.instructions)) return false;
  const result = $("#coach-action-result");
  const nutrition = recipe.nutrition || {};
  const cacheLabel = cache === "private" ? "Your saved recipe" : cache === "shared" ? "MealDaddy recipe library" : "Newly personalized";
  result.innerHTML = `<article class="recipe-card" data-saved-recipe-id="${escapeHtml(String(savedRecipeId || ""))}">
    <div><span class="beta-tag">Beta Test</span><h3>${escapeHtml(String(recipe.title || "Personalized favorite"))}</h3><p>${escapeHtml(String(recipe.summary || ""))}</p></div>
    <div class="recipe-meta"><span>${escapeHtml(String(recipe.detail_level || "quick"))}</span><span>${escapeHtml(String(recipe.servings || 1))} servings</span><span>${escapeHtml(cacheLabel)}</span></div>
    <div class="recipe-columns"><section><h4>Ingredients</h4><ul>${recipe.ingredients.map((item) => `<li><strong>${escapeHtml(String(item.amount || ""))}</strong> ${escapeHtml(String(item.item || ""))}</li>`).join("")}</ul></section><section><h4>Shopping list</h4>${(recipe.shopping_list || []).map((group) => `<p><strong>${escapeHtml(String(group.department || "Other"))}:</strong> ${escapeHtml((group.items || []).join(", "))}</p>`).join("")}</section></div>
    <section><h4>Instructions</h4><ol>${recipe.instructions.map((step) => `<li>${escapeHtml(String(step))}</li>`).join("")}</ol></section>
    ${(recipe.substitutions || []).length ? `<section><h4>Substitutions</h4><ul>${recipe.substitutions.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul></section>` : ""}
    ${(recipe.personalization || []).length ? `<section><h4>How this supports your requirements</h4><ul>${recipe.personalization.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul></section>` : ""}
    <div class="recipe-meta"><span>${formatEstimateNumber(nutrition.calories)} cal</span><span>${formatEstimateNumber(nutrition.protein_g)}g protein</span><span>${formatEstimateNumber(nutrition.net_carbs_g)}g net carbs</span><span>Impact ${formatEstimateNumber(nutrition.inflammation_score)}/10</span></div>
    <p>${escapeHtml(String(recipe.source_note || "Nutrition is estimated."))}</p>
    <form class="recipe-feedback"><strong>Help develop this Beta</strong><span>Please rate this recreation and tell us what would make it more useful.</span><div class="recipe-rating" role="group" aria-label="Recipe rating">${[1,2,3,4,5].map((rating) => `<button type="button" data-recipe-rating="${rating}">${rating}</button>`).join("")}</div><textarea maxlength="1500" placeholder="What worked? What should MealDaddy change?"></textarea><button class="button" type="submit">Send recipe feedback</button><p role="status"></p></form>
  </article>`;
  return true;
}

function renderRestaurantPlan(rawPlan) {
  const plan = normalizeRestaurantPlan(rawPlan);
  if (!plan) return false;
  state.restaurantPlan = plan;
  const result = $("#coach-action-result");
  result.innerHTML = `<section class="restaurant-plan" aria-label="Restaurant recommendations">
    <p class="restaurant-plan-intro">${escapeHtml(plan.overview)}</p>
    ${plan.options.map((option, index) => {
      const substitutions = Array.isArray(option.substitutions)
        ? option.substitutions.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
        : [];
      const sourceUrl = safeRestaurantSourceUrl(option.source_url);
      const restaurantName = String(option.restaurant_name || plan.restaurant || "Restaurant").trim();
      const address = String(option.address || "").trim();
      const mapUrl = restaurantMapUrl(restaurantName, address);
      const fullOrder = String(option.order || "").replace(/\s+/g, " ").trim();
      const conciseOrder = fullOrder.length > 180 ? `${fullOrder.slice(0, 177).replace(/\s+\S*$/, "")}…` : fullOrder;
      const published = option.evidence_type === "restaurant_published" && sourceUrl;
      return `<article class="restaurant-choice">
        <span class="restaurant-choice-letter" aria-hidden="true">${restaurantChoiceLetters[index]}</span>
        <div class="restaurant-choice-main"><span>${escapeHtml(restaurantFitLabels[index])}</span><h3>${escapeHtml(restaurantName)}</h3>${address ? `<div class="restaurant-address"><button type="button" data-copy-restaurant-address="${escapeHtml(address)}">Copy</button><small>${escapeHtml(address)}</small>${mapUrl ? `<a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">Maps</a>` : ""}</div>` : ""}<h4>${escapeHtml(String(option.title || `Option ${restaurantChoiceLetters[index]}`))}</h4><p>${escapeHtml(conciseOrder)}</p></div>
        ${substitutions.length ? `<ul class="restaurant-substitutions" aria-label="Accepted substitutions">${substitutions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        <div class="restaurant-choice-metrics"><span><strong>${formatEstimateNumber(option.calories)} cal</strong>Energy</span><span><strong>${formatEstimateNumber(option.protein_g)}g</strong>Protein</span><span><strong>${formatEstimateNumber(option.net_carbs_g)}g</strong>Net carbs</span><span><strong>${formatEstimateNumber(option.fiber_g)}g</strong>Fiber</span></div>
        <p class="restaurant-choice-why">${escapeHtml(String(option.why || ""))}</p>
        <p class="restaurant-choice-source">${published ? `Restaurant-published values · <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">view source</a>` : "Meal Daddy estimate · published values were not confirmed"}</p>
        <button class="button" type="button" data-log-restaurant-option="${index}">Add ${restaurantChoiceLetters[index]} to Today’s Entries</button>
      </article>`;
    }).join("")}
    <p class="restaurant-plan-note">Nutrition varies by location, preparation, portion, and substitutions. Choosing an option adds the customized order to Today’s Entries. You can save it as a favorite from the entry afterward.</p>
  </section>`;
  return true;
}

$("#plan-dinner").addEventListener("click", () => openCoachAction("dinner"));
$("#restaurant-mode").addEventListener("click", () => openCoachAction("restaurant"));
$("#personalize-feedback").addEventListener("click", () => {
  openCoachAction("dinner");
  const carbConstraint = state.netCarbGoal
    ? `My saved daily ceiling is ${state.netCarbGoal}g net carbs. I have already logged about ${Math.round(state.currentTotals.netCarbs)}g today, leaving about ${Math.max(0, Math.round(state.netCarbGoal - state.currentTotals.netCarbs))}g. Treat that as a hard limit whenever possible.`
    : "";
  $("#coach-action-context").value = `${carbConstraint} Help me choose a practical next meal or snack with about ${state.suggestedProteinTarget}g protein. Start with my saved favorite proteins, foods I love, foods I dislike, foods I must avoid, eating style, and biggest challenge. Give me two or three concrete choices with portions. Estimate net carbs for each choice and show my projected daily net carbs when I have a saved ceiling. Do not recommend an option that would exceed it when a lower-carb option exists. If my saved profile is not enough, ask me one short question instead of making a generic recommendation.`.trim();
  $("#coach-action-context").focus();
});
$("#close-coach-action").addEventListener("click", () => {
  $("#coach-action-form").hidden = true;
  clearCoachPhoto();
  clearRestaurantLocation();
  showAppView("plan");
});

$("#coach-action-result").addEventListener("click", async (event) => {
  const ratingButton = event.target.closest("[data-recipe-rating]");
  if (ratingButton) {
    ratingButton.closest(".recipe-rating").querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button === ratingButton));
    ratingButton.closest(".recipe-feedback").dataset.rating = ratingButton.dataset.recipeRating;
    return;
  }
  const copyAddressButton = event.target.closest("[data-copy-restaurant-address]");
  if (copyAddressButton) {
    try {
      await navigator.clipboard.writeText(copyAddressButton.dataset.copyRestaurantAddress);
      toast("Restaurant address copied.");
    } catch {
      toast("The address could not be copied automatically. Press and hold the address to copy it.");
    }
    return;
  }
  const button = event.target.closest("[data-log-restaurant-option]");
  if (!button || !state.restaurantPlan) return;
  const option = state.restaurantPlan.options[Number(button.dataset.logRestaurantOption)];
  if (!option) return;
  button.disabled = true;
  button.textContent = "Adding to Today’s Entries…";
  const ledgerEntry = restaurantOptionToLedgerEntry(state.restaurantPlan, option);
  const { error } = await supabase.from("ledger_entries").insert({
    user_id: user.id,
    client_request_id: crypto.randomUUID(),
    kind: "meal",
    occurred_at: new Date().toISOString(),
    description: ledgerEntry.description,
    meal_label: defaultMealLabel(),
    nutrition_estimate: ledgerEntry.nutrition_estimate,
    status: "estimated"
  });
  if (error) {
    toast(error.message || "The restaurant choice could not be added.");
    button.disabled = false;
    button.textContent = `Add ${option.label} to Today’s Entries`;
    return;
  }
  await loadLedger();
  button.textContent = `Added ${option.label} to Today’s Entries`;
  toast(`${state.restaurantPlan.restaurant} option ${option.label} was added to Today’s Entries.`);
});

$("#coach-action-result").addEventListener("submit", async (event) => {
  const form = event.target.closest(".recipe-feedback");
  if (!form) return;
  event.preventDefault();
  const rating = Number(form.dataset.rating || 0);
  const savedRecipeId = form.closest("[data-saved-recipe-id]")?.dataset.savedRecipeId || null;
  const status = form.querySelector('[role="status"]');
  if (!rating) { status.textContent = "Choose a rating from 1 to 5."; return; }
  status.textContent = "Saving your beta feedback...";
  const { error } = await supabase.from("recipe_beta_feedback").insert({ user_id: user.id, saved_recipe_id: savedRecipeId || null, rating, comment: form.querySelector("textarea").value.trim() });
  status.textContent = error ? "Feedback could not be saved yet." : "Thank you—your feedback will help shape this feature.";
});

$("#coach-action-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const enteredContext = $("#coach-action-context").value.trim();
  if (["restaurant", "recipe"].includes(state.coachMode) && !enteredContext) {
    toast(state.coachMode === "recipe" ? "Describe the favorite meal you want to recreate." : "Enter a restaurant, type of food, or what you want help ordering.");
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
    : state.coachMode === "recipe"
      ? "Checking saved recipes and building your personalized recreation..."
    : state.coachPhoto
      ? "Reviewing your photo and building a practical meal..."
      : "Building a practical meal...";
  status.hidden = false;
  result.hidden = true;
  let photoPath = "";
  try {
    if (state.coachMode === "dinner" && state.coachPhoto) {
      const preparedPhoto = await preparePrivateImage(state.coachPhoto);
      const safeName = preparedPhoto.name.replace(/[^a-z0-9._-]/gi, "-");
      photoPath = `${user.id}/coach-${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("meal-photos")
        .upload(photoPath, preparedPhoto, { upsert: false, contentType: preparedPhoto.type });
      if (uploadError) {
        status.textContent = `Photo was not uploaded: ${uploadError.message}`;
        return;
      }
    }
    const recipeMode = state.coachMode === "recipe";
    const detailLevel = document.querySelector('input[name="recipe_detail"]:checked')?.value || "quick";
    const { data, error } = await invokeAuthenticated(recipeMode ? "recipe-recreation" : "coach-action", {
      body: {
        mode: state.coachMode,
        context,
        source: recipeMode ? context : undefined,
        detailLevel: recipeMode ? detailLevel : undefined,
        searchCurrent: recipeMode ? $("#recipe-search-current").checked : undefined,
        photoPath,
        location: state.coachMode === "restaurant" ? state.restaurantLocation : null,
        nutritionContext: {
          calories: Math.round(state.currentTotals.calories),
          protein: Math.round(state.currentTotals.protein),
          totalCarbs: Math.round(state.currentTotals.carbs),
          netCarbs: Math.round(state.currentTotals.netCarbs),
          netCarbGoal: state.netCarbGoal || null,
          hydrationOunces: Math.round(state.currentTotals.water),
          hydrationGoalOunces: state.waterGoal,
          hydrationTargetSource: state.hydrationTargetSource,
          sodiumMg: state.currentTotals.sodium === null ? null : Math.round(state.currentTotals.sodium),
          sodiumGoalMg: state.sodiumGoal
        }
      }
    });
    if (error || (!data?.guidance && !data?.restaurantPlan && !data?.recipePlan)) {
      const failure = error ? await readFunctionFailure(error) : { message: "" };
      const baseMessage = data?.error || failure.message || error?.message || "Meal Daddy could not generate guidance right now.";
      status.textContent = state.coachMode === "restaurant"
        ? `${baseMessage} Begin the description with your ZIP or ZIP+4, followed by the restaurant or request, and retry.`
        : baseMessage;
      return;
    }
    status.hidden = true;
    if (recipeMode && data.recipePlan) {
      if (!renderRecipePlan(data.recipePlan, data.savedRecipeId, data.cache)) result.textContent = "MealDaddy could not format this recipe. Please try again.";
    } else if (state.coachMode === "restaurant" && data.restaurantPlan) {
      if (!renderRestaurantPlan(data.restaurantPlan)) {
        result.textContent = data.guidance || "Meal Daddy could not format the restaurant choices. Please try again.";
      }
    } else {
      state.restaurantPlan = null;
      result.textContent = data.guidance;
    }
    result.hidden = false;
    clearCoachPhoto();
    clearRestaurantLocation();
  } catch (error) {
    const baseMessage = error?.message || "Meal Daddy could not generate guidance right now.";
    status.textContent = state.coachMode === "restaurant"
      ? `${baseMessage} Begin the description with your ZIP or ZIP+4, followed by the restaurant or request, and retry.`
      : baseMessage;
  } finally {
    if (photoPath) {
      const { error: removeError } = await supabase.storage.from("meal-photos").remove([photoPath]);
      if (removeError) console.warn("Temporary coach photo cleanup failed.", removeError);
    }
    button.disabled = false;
  }
});

const leftoverNutritionFields = ["calories", "protein_g", "carbs_g", "net_carbs_g", "fat_g", "fiber_g", "sodium_mg", "added_sugar_g", "saturated_fat_g", "hydration_ounces"];

function clampPercent(value, fallback = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}

function roundNutrition(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function originalEstimateForAdjustment(estimate = {}) {
  const priorOriginal = estimate.leftover_adjustment?.original_estimate;
  const source = priorOriginal && typeof priorOriginal === "object" ? priorOriginal : estimate;
  const copy = JSON.parse(JSON.stringify(source));
  delete copy.leftover_adjustment;
  return copy;
}

function closeLeftoverAdjustment() {
  if ($("#leftover-adjustment").hidden) return;
  $("#leftover-adjustment").hidden = true;
  document.body.classList.remove("modal-open");
  $("#leftover-analysis-form").reset();
  $("#leftover-review-form").reset();
  $("#leftover-analysis-form").hidden = false;
  $("#leftover-review-form").hidden = true;
  $("#leftover-photo-name").textContent = "No photo selected.";
  $("#leftover-analysis-status").textContent = "";
  $("#leftover-review-status").textContent = "";
  $("#leftover-component-list").innerHTML = "";
  state.leftoverEntryId = null;
  state.leftoverPhoto = null;
  state.leftoverAnalysis = null;
  state.leftoverReturnFocus?.focus();
  state.leftoverReturnFocus = null;
}

function openLeftoverAdjustment(entry, trigger) {
  if (!hasCurrentCoreMembership()) {
    toast("Second-photo portion correction is included with Meal Daddy Core.");
    return;
  }
  state.leftoverEntryId = entry.id;
  state.leftoverPhoto = null;
  state.leftoverAnalysis = null;
  state.leftoverReturnFocus = trigger;
  $("#leftover-analysis-form").reset();
  $("#leftover-review-form").reset();
  $("#leftover-analysis-form").hidden = false;
  $("#leftover-review-form").hidden = true;
  $("#leftover-photo-name").textContent = "No photo selected.";
  $("#leftover-analysis-status").textContent = "";
  $("#leftover-review-status").textContent = "";
  const hasOriginalPhoto = typeof originalEstimateForAdjustment(entry.nutrition_estimate).photo_path === "string";
  $("#leftover-adjustment-intro").textContent = hasOriginalPhoto
    ? `Take a second photo of what remains from ${entry.description}. Meal Daddy will compare it with the original photo.`
    : `Take a photo of what remains from ${entry.description}. No original photo is attached, so add a short note and carefully review the percentages.`;
  $("#leftover-adjustment").hidden = false;
  document.body.classList.add("modal-open");
  $("#leftover-photo-input").focus();
}

function renderLeftoverReview(entry, analysis) {
  const base = originalEstimateForAdjustment(entry.nutrition_estimate);
  const overall = Math.round(clampPercent(analysis.overall_percent_eaten));
  $("#leftover-overall-percent").value = overall;
  $("#leftover-review-summary").textContent = `${analysis.summary || "Review the amount eaten before applying."} Confidence: ${analysis.confidence || "low"}.`;
  const components = Array.isArray(base.components) ? base.components : [];
  const suggestions = Array.isArray(analysis.component_adjustments) ? analysis.component_adjustments : [];
  $("#leftover-components").hidden = components.length === 0;
  $("#leftover-component-list").innerHTML = components.map((component, index) => {
    const suggestion = suggestions.find((item) => Number(item.component_index) === index);
    const percent = Math.round(clampPercent(suggestion?.percent_eaten, overall));
    const note = String(suggestion?.note || "Review this visual estimate.");
    return `<label><span><strong>${escapeHtml(String(component.name || `Item ${index + 1}`))}</strong><small>${escapeHtml(note)}</small></span><span><input type="number" min="0" max="100" step="1" inputmode="numeric" value="${percent}" data-leftover-component="${index}" aria-label="Percent of ${escapeHtml(String(component.name || `item ${index + 1}`))} eaten" />%</span></label>`;
  }).join("");
  $("#leftover-analysis-form").hidden = true;
  $("#leftover-review-form").hidden = false;
  $("#leftover-overall-percent").focus();
}

$("#leftover-photo-input").addEventListener("change", (event) => {
  const file = event.target.files[0] || null;
  const validationMessage = mealPhotoValidationMessage(file);
  if (validationMessage) {
    state.leftoverPhoto = null;
    event.target.value = "";
    $("#leftover-photo-name").textContent = "No photo selected.";
    $("#leftover-analysis-status").textContent = validationMessage;
    return;
  }
  state.leftoverPhoto = file;
  $("#leftover-photo-name").textContent = state.leftoverPhoto ? `${state.leftoverPhoto.name || "After-meal photo"} ready` : "No photo selected.";
});

document.querySelectorAll("[data-close-leftover-adjustment]").forEach((button) => button.addEventListener("click", closeLeftoverAdjustment));

$("#leftover-review-back").addEventListener("click", () => {
  state.leftoverAnalysis = null;
  $("#leftover-review-form").hidden = true;
  $("#leftover-analysis-form").hidden = false;
  $("#leftover-analysis-status").textContent = "Take or choose another after-meal photo.";
  $("#leftover-photo-input").focus();
});

$("#leftover-analysis-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const entry = entryById(state.leftoverEntryId);
  const file = state.leftoverPhoto;
  if (!entry || !file) {
    $("#leftover-analysis-status").textContent = "Take or choose an after-meal photo first.";
    return;
  }
  const validationMessage = mealPhotoValidationMessage(file);
  if (validationMessage) {
    $("#leftover-analysis-status").textContent = validationMessage;
    return;
  }
  const button = $("#analyze-leftovers");
  button.disabled = true;
  $("#leftover-analysis-status").textContent = "Comparing what was served with what remains...";
  let photoPath = "";
  try {
    const preparedPhoto = await preparePrivateImage(file);
    const safeName = (preparedPhoto.name || "after-meal.jpg").replace(/[^a-z0-9._-]/gi, "-");
    photoPath = `${user.id}/leftover-scan-${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("meal-photos").upload(photoPath, preparedPhoto, { upsert: false, contentType: preparedPhoto.type });
    if (uploadError) throw uploadError;
    const { data, error } = await invokeAuthenticated("adjust-leftovers", {
      body: {
        entryId: entry.id,
        photoPath,
        context: $("#leftover-context").value.trim()
      }
    });
    if (error || !data?.analysis) {
      const failure = error ? await readFunctionFailure(error) : { status: 0, message: data?.error || "" };
      throw Object.assign(new Error(failure.message || "The after-meal photo could not be analyzed."), { status: failure.status });
    }
    state.leftoverAnalysis = data.analysis;
    renderLeftoverReview(entry, data.analysis);
  } catch (error) {
    if (error.status === 402) {
      $("#leftover-analysis-status").textContent = "An active Meal Daddy Core membership is required.";
    } else if (error.status === 429) {
      $("#leftover-analysis-status").textContent = "This month's Core AI allowance has been reached.";
    } else {
      $("#leftover-analysis-status").textContent = error.message || "The after-meal photo could not be analyzed.";
    }
  } finally {
    if (photoPath) {
      const { error: cleanupError } = await supabase.storage.from("meal-photos").remove([photoPath]);
      if (cleanupError) console.warn("Temporary after-meal photo cleanup failed.", cleanupError);
    }
    button.disabled = false;
  }
});

$("#leftover-review-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const entry = entryById(state.leftoverEntryId);
  const analysis = state.leftoverAnalysis;
  if (!entry || !analysis) return;
  const overallPercent = clampPercent($("#leftover-overall-percent").value);
  const base = originalEstimateForAdjustment(entry.nutrition_estimate);
  const adjusted = JSON.parse(JSON.stringify(base));
  const componentInputs = [...document.querySelectorAll("[data-leftover-component]")];
  const componentPercentages = componentInputs.map((input) => ({
    component_index: Number(input.dataset.leftoverComponent),
    percent_eaten: clampPercent(input.value, overallPercent)
  }));
  if (Array.isArray(adjusted.components) && adjusted.components.length && componentPercentages.length) {
    adjusted.components = adjusted.components.map((component, index) => {
      const percentage = componentPercentages.find((item) => item.component_index === index)?.percent_eaten ?? overallPercent;
      const scaled = { ...component };
      leftoverNutritionFields.forEach((field) => {
        if (typeof component[field] === "number") scaled[field] = roundNutrition(component[field] * percentage / 100);
      });
      return scaled;
    });
    leftoverNutritionFields.forEach((field) => {
      adjusted[field] = roundNutrition(adjusted.components.reduce((sum, component) => sum + Number(component[field] || 0), 0));
    });
    const distinctPortions = new Set(componentPercentages.map((item) => Math.round(item.percent_eaten)));
    if (distinctPortions.size > 1) {
      const adjustedInflammationScore = weightedInflammationScore(adjusted.components);
      if (adjustedInflammationScore !== null) {
        adjusted.inflammation_score = adjustedInflammationScore;
        adjusted.inflammation_summary = "Food-pattern impact updated to reflect the different portions reviewed from the after-meal photo.";
      }
    }
  } else {
    leftoverNutritionFields.forEach((field) => {
      if (typeof adjusted[field] === "number") adjusted[field] = roundNutrition(adjusted[field] * overallPercent / 100);
    });
  }
  const adjustmentNote = `After-meal photo reviewed; about ${Math.round(overallPercent)}% of the meal was eaten.`;
  adjusted.note = [base.note, adjustmentNote].filter(Boolean).join(" ").slice(0, 500);
  if (analysis.confidence === "low") adjusted.confidence = "low";
  adjusted.leftover_adjustment = {
    version: 1,
    overall_percent_eaten: overallPercent,
    component_percentages: componentPercentages,
    confidence: analysis.confidence || "low",
    summary: String(analysis.summary || "").slice(0, 300),
    adjusted_at: new Date().toISOString(),
    original_estimate: base
  };
  const saveButton = event.currentTarget.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  $("#leftover-review-status").textContent = "Applying your reviewed portions...";
  const { error } = await supabase
    .from("ledger_entries")
    .update({ nutrition_estimate: adjusted, status: "estimated" })
    .eq("id", entry.id)
    .eq("user_id", user.id);
  saveButton.disabled = false;
  if (error) {
    $("#leftover-review-status").textContent = error.message;
    return;
  }
  closeLeftoverAdjustment();
  await loadLedger();
  toast("Meal updated to the amount you ate. Open Edit to review or undo the correction.");
});

$("#ledger-list").addEventListener("click", async (event) => {
  const retryButton = event.target.closest("[data-retry-estimate]");
  const impactButton = event.target.closest("[data-add-impact]");
  const editButton = event.target.closest("[data-edit-entry]");
  const cancelButton = event.target.closest("[data-cancel-edit]");
  const deleteButton = event.target.closest("[data-delete-entry]");
  const adjustButton = event.target.closest("[data-adjust-leftovers]");
  const undoButton = event.target.closest("[data-undo-leftover]");
  const favoriteButton = event.target.closest("[data-save-entry-favorite]");
  if (retryButton) {
    await retryEstimateEntry(retryButton.dataset.retryEstimate);
    return;
  }
  if (impactButton) {
    await addMealImpactDetails(impactButton.dataset.addImpact);
    return;
  }
  if (favoriteButton) {
    const entry = entryById(favoriteButton.dataset.saveEntryFavorite);
    if (!entry || !state.savedFoodsApi) return;
    const estimate = entry.nutrition_estimate || {};
    const favoriteStatus = state.savedFoodsApi.favoriteStatus(entry);
    const forceNew = favoriteButton.dataset.favoriteMode === "new";
    const existingFood = favoriteButton.dataset.favoriteMode === "update" ? favoriteStatus?.food || null : null;
    if (estimate.restaurant) {
      state.savedFoodsApi.reviewRestaurantFood({
        item_type: "restaurant_item",
        name: String(estimate.restaurant_order || entry.description).slice(0, 160),
        brand_or_restaurant: String(estimate.restaurant).slice(0, 160),
        serving_description: "1 customized order",
        calories: Number(estimate.calories || 0),
        protein_g: Number(estimate.protein_g || 0),
        carbs_g: Number(estimate.carbs_g || 0),
        net_carbs_g: Number(estimate.net_carbs_g || 0),
        fat_g: Number(estimate.fat_g || 0),
        fiber_g: Number(estimate.fiber_g || 0),
        sugar_alcohols_g: 0,
        allulose_g: 0,
        hydration_ounces: Number(estimate.hydration_ounces || 0),
        evidence_type: estimate.source === "restaurant_published" ? "restaurant_published" : "restaurant_estimate",
        confidence: estimate.confidence || "medium",
        notes: [
          `Customized order: ${estimate.restaurant_order || entry.description}`,
          Array.isArray(estimate.substitutions) && estimate.substitutions.length ? `Substitutions: ${estimate.substitutions.join("; ")}` : "",
          estimate.note || "",
          estimate.source_url ? `Source checked ${estimate.source_checked_on || ""}: ${estimate.source_url}` : ""
        ].filter(Boolean).join("\n").slice(0, 1000)
      }, { forceNew, existingFood });
    } else {
      state.savedFoodsApi.reviewEstimatedMeal({
        description: entry.description,
        mealLabel: mealLabels.has(entry.meal_label) ? entry.meal_label : "Meal",
        estimate
      }, null, { forceNew, existingFood });
    }
    toast(existingFood ? "Review the changes, then update the existing favorite." : "Review the meal, then save it to My Foods.");
    return;
  }
  if (adjustButton) {
    const entry = entryById(adjustButton.dataset.adjustLeftovers);
    if (entry) openLeftoverAdjustment(entry, adjustButton);
  }
  if (undoButton) {
    const entry = entryById(undoButton.dataset.undoLeftover);
    const original = entry?.nutrition_estimate?.leftover_adjustment?.original_estimate;
    if (!entry || !original || !window.confirm("Undo the after-meal portion correction and restore the original estimate?")) return;
    undoButton.disabled = true;
    const { error } = await supabase
      .from("ledger_entries")
      .update({ nutrition_estimate: original, status: "estimated" })
      .eq("id", entry.id)
      .eq("user_id", user.id);
    if (error) {
      toast(error.message);
      undoButton.disabled = false;
      return;
    }
    await loadLedger();
    toast("Original meal estimate restored.");
  }
  if (editButton) {
    $(`[data-edit-form="${editButton.dataset.editEntry}"]`).hidden = false;
    editButton.hidden = true;
  }
  if (cancelButton) {
    $(`[data-edit-form="${cancelButton.dataset.cancelEdit}"]`).hidden = true;
    $(`[data-edit-entry="${cancelButton.dataset.cancelEdit}"]`).hidden = false;
  }
  if (deleteButton) {
    const entry = entryById(deleteButton.dataset.deleteEntry);
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
  const entry = entryById(form.dataset.editForm);
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
    const retainedPhotoPath = typeof entry.nutrition_estimate?.photo_path === "string" ? entry.nutrition_estimate.photo_path : null;
    const favoriteOrigin = entry.nutrition_estimate?.favorite_origin || (
      entry.nutrition_estimate?.source === "saved_food"
        ? {
            id: entry.nutrition_estimate.saved_food_id || null,
            key: entry.nutrition_estimate.saved_food_id ? `sync:${entry.nutrition_estimate.saved_food_id}` : "",
            description: entry.description
          }
        : null
    );
    changes.nutrition_estimate = {
      ...(retainedPhotoPath ? { photo_path: retainedPhotoPath } : {}),
      ...(favoriteOrigin ? { favorite_origin: favoriteOrigin } : {})
    };
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
    await retryEstimateEntry(entry.id, { announceStart: false });
  } else if (targetKind === "hydration") {
    toast(`Hydration updated: ${ounces} fl oz.`);
  } else {
    toast("Meal label updated.");
  }
});

function hideSavedFoodMatchPrompt() {
  $("#saved-food-match-prompt").hidden = true;
  state.pendingQuickLog = null;
}

function showSavedFoodMatchPrompt(description, selectedCategory, selectedDate, match, saveFavorite = false) {
  state.pendingQuickLog = { description, selectedCategory, selectedDate, match, saveFavorite };
  $("#saved-food-match-title").textContent = `Use ${match.food.name} from My Foods?`;
  $("#saved-food-match-copy").textContent = `${match.subtitle ? `${match.subtitle}. ` : ""}${match.nutritionLine}. These are already saved reviewed values, so no AI estimate or duplicate favorite is needed.`;
  $("#saved-food-match-servings").value = match.servings;
  $("#saved-food-match-prompt").hidden = false;
  $("#use-saved-food-match").focus();
}

function hideLabelSavePrompt() {
  $("#label-save-prompt").hidden = true;
  state.pendingLabelCandidate = null;
  state.pendingLabelPhoto = null;
}

function showLabelSavePrompt(candidate, photo) {
  state.pendingLabelCandidate = candidate;
  state.pendingLabelPhoto = photo;
  $("#label-save-title").textContent = `Save ${candidate.name || "this product"} for consistent reuse?`;
  $("#label-save-copy").textContent = `${candidate.serving_description || "1 serving"}: ${Math.round(Number(candidate.calories || 0))} cal, ${Number(candidate.protein_g || 0)}g protein, ${Number(candidate.carbs_g || 0)}g total carbs, ${Number(candidate.net_carbs_g || 0)}g net carbs. Review every value before saving.`;
  $("#label-save-prompt").hidden = false;
  toast("Nutrition label found. Review and save it to prevent future re-estimation.");
}

$("#use-saved-food-match").addEventListener("click", async () => {
  const pending = state.pendingQuickLog;
  if (!pending || !state.savedFoodsApi) return;
  const button = $("#use-saved-food-match");
  button.disabled = true;
  try {
    await state.savedFoodsApi.logFood(
      pending.match.food,
      $("#saved-food-match-servings").value,
      mealLabels.has(pending.selectedCategory) ? pending.selectedCategory : defaultMealLabel(),
      occurredAtForEntryDate(pending.selectedDate),
      entryDateDisplayLabel(pending.selectedDate)
    );
    $("#quick-entry").value = "";
    $("#meal-label").value = defaultMealLabel();
    resetQuickEntryDate();
    hideSavedFoodMatchPrompt();
  } catch (error) {
    toast(error.message || "The saved food could not be logged.");
  } finally {
    button.disabled = false;
  }
});

$("#estimate-new-entry").addEventListener("click", () => {
  const pending = state.pendingQuickLog;
  if (!pending) return;
  $("#quick-entry").value = pending.description;
  $("#meal-label").value = pending.selectedCategory;
  setQuickEntryDate(pending.selectedDate);
  state.skipSavedFoodMatch = true;
  hideSavedFoodMatchPrompt();
  $("#entry-form").requestSubmit(pending.saveFavorite ? $("#log-favorite-entry") : $("#log-entry"));
});

$("#review-label-save").addEventListener("click", () => {
  if (!state.pendingLabelCandidate || !state.savedFoodsApi) return;
  const candidate = state.pendingLabelCandidate;
  const photo = state.pendingLabelPhoto;
  hideLabelSavePrompt();
  state.savedFoodsApi.reviewDetectedFood(candidate, photo);
});

$("#dismiss-label-save").addEventListener("click", hideLabelSavePrompt);

function setQuickLogBusy(busy) {
  $("#log-entry").disabled = busy;
  const hydrationOnly = $("#meal-label").value === "Hydration";
  $("#log-favorite-entry").disabled = busy || hydrationOnly;
  $("#log-favorite-entry").title = hydrationOnly ? "Favorite Meals are available for meals and snacks." : "Log this meal, calculate its nutrition, then review it as a reusable favorite.";
}

$("#meal-label").addEventListener("change", () => setQuickLogBusy(false));
setQuickLogBusy(false);

$("#entry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const wantsFavorite = event.submitter?.value === "favorite";
  const input = $("#quick-entry");
  const description = input.value.trim() || (state.photo ? "Meal photo" : "New meal");
  const selectedCategory = $("#meal-label").value;
  const selectedDate = selectedQuickEntryDate();
  let occurredAt;
  try {
    occurredAt = occurredAtForEntryDate(selectedDate);
  } catch (error) {
    toast(error.message || "Choose a valid entry date.");
    return;
  }
  const selectedDateLabel = entryDateDisplayLabel(selectedDate);
  const dateSuffix = selectedDateLabel === "today" ? "" : ` for ${selectedDateLabel}`;
  const ounces = hydrationOunces(description);
  const kind = selectedCategory === "Hydration" ? "hydration" : "meal";
  if (kind === "hydration" && ounces === null) {
    toast("Include a fluid amount, such as 16 oz, 2 cups, 500 ml, or 1 liter.");
    return;
  }
  if (kind === "hydration" && wantsFavorite) {
    toast("Favorite Meals are for meals and snacks. Use Log for a Hydration-only entry.");
    return;
  }
  if (kind === "meal" && !state.photo && !state.skipSavedFoodMatch && state.savedFoodsApi) {
    const match = state.savedFoodsApi.findBestMatch(description);
    if (match) {
      showSavedFoodMatchPrompt(description, selectedCategory, selectedDate, match, wantsFavorite);
      return;
    }
  }

  state.skipSavedFoodMatch = false;
  hideSavedFoodMatchPrompt();
  setQuickLogBusy(true);
  const submittedPhoto = state.photo;
  const photoValidationMessage = mealPhotoValidationMessage(submittedPhoto);
  if (photoValidationMessage) {
    state.photo = null;
    $("#photo-input").value = "";
    toast(photoValidationMessage);
    setQuickLogBusy(false);
    return;
  }
  let photoPath = null;
  let photoUploaded = false;
  let photoAttachedToEntry = false;
  try {
    if (submittedPhoto) {
      const preparedPhoto = await preparePrivateImage(submittedPhoto);
      const safeName = preparedPhoto.name.replace(/[^a-z0-9._-]/gi, "-");
      photoPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("meal-photos").upload(photoPath, preparedPhoto, { upsert: false, contentType: preparedPhoto.type });
      if (uploadError) {
        throw new Error(`Photo was not uploaded: ${uploadError.message}`);
      }
      photoUploaded = true;
    }
    const estimateHydration = kind === "hydration" && hydrationNeedsNutritionEstimate(description);
    const nutrition = kind === "hydration" ? { ounces } : photoPath ? { photo_path: photoPath } : null;
    const mealLabel = mealLabels.has(selectedCategory) ? selectedCategory : defaultMealLabel();
    const { data: savedEntry, error } = await supabase.from("ledger_entries")
      .insert({ user_id: user.id, client_request_id: crypto.randomUUID(), kind, occurred_at: occurredAt, description, meal_label: kind === "meal" ? mealLabel : null, nutrition_estimate: nutrition, status: kind === "hydration" && !estimateHydration ? "estimated" : "pending_estimate" })
      .select("id")
      .single();
    if (error || !savedEntry?.id) throw error || new Error("The meal entry was not saved.");
    // Once the ledger insert succeeds, this is an attached private photo rather than an orphan.
    // Estimate retries and after-meal comparisons rely on the retained path.
    photoAttachedToEntry = Boolean(photoPath);
    input.value = "";
    state.photo = null;
    $("#photo-input").value = "";
    $("#meal-label").value = defaultMealLabel();
    resetQuickEntryDate();
    await loadLedger();
    if (kind === "meal" || estimateHydration) {
      toast(kind === "hydration" ? `Drink saved${dateSuffix}. Estimating its nutrition...` : wantsFavorite ? `Meal saved${dateSuffix}. Building your Favorite Meal...` : `Meal saved${dateSuffix}. Estimating nutrition...`);
      state.estimatingEntryIds.add(savedEntry.id);
      renderLedger();
      let estimateData = null;
      let estimateError = null;
      try {
        const result = await invokeAuthenticated("estimate-entry", {
          body: { entryId: savedEntry.id, saveFavorite: wantsFavorite }
        });
        estimateData = result.data;
        estimateError = result.error;
      } catch (error) {
        estimateError = error;
      } finally {
        state.estimatingEntryIds.delete(savedEntry.id);
      }
      await loadLedger();
      if (estimateError) {
        await handleEstimateFailure(estimateError, kind === "hydration" ? "Drink" : "Meal", "saved", savedEntry.id);
      } else {
        $("#estimate-membership-prompt").hidden = true;
        const reconciledDescription = estimateData?.entryDescription || description;
        if (wantsFavorite && estimateData?.estimate && state.savedFoodsApi) {
          state.savedFoodsApi.reviewEstimatedMeal({ description: reconciledDescription, mealLabel, estimate: estimateData.estimate }, submittedPhoto);
          toast(`Nutrition${dateSuffix} is ready. Review and save your Favorite Meal.`);
        } else if (estimateData?.labelCandidate && submittedPhoto && state.savedFoodsApi) {
          showLabelSavePrompt(estimateData.labelCandidate, submittedPhoto);
        } else if (estimateData?.descriptionReconciliationNote) {
          toast(`${estimateData.descriptionReconciliationNote} Edit the entry if you want to change the written description.`);
        } else {
          toast(submittedPhoto ? `Photo identified and nutrition estimate ready${dateSuffix}.` : `Nutrition estimate ready${dateSuffix}.`);
        }
      }
    } else {
      toast(`Saved${dateSuffix} to your private daily ledger.`);
    }
  } catch (error) {
    toast(error.message || "The meal could not be logged.");
  } finally {
    if (photoUploaded && !photoAttachedToEntry && photoPath) {
      try {
        const { error: cleanupError } = await supabase.storage.from("meal-photos").remove([photoPath]);
        if (cleanupError) console.warn("Failed Quick Log photo cleanup.", cleanupError);
      } catch (cleanupError) {
        console.warn("Failed Quick Log photo cleanup.", cleanupError);
      }
    }
    setQuickLogBusy(false);
  }
});

async function estimatePendingEntries() {
  if (!hasCurrentCoreMembership()) return;
  const pending = state.entries.filter((entry) =>
    (entry.kind === "meal" && (
      entry.status === "pending_estimate" ||
      (entry.description.trim().toLowerCase() === "meal photo" && typeof entry.nutrition_estimate?.photo_path === "string")
    )) ||
    (entry.kind === "hydration" &&
      typeof entry.nutrition_estimate?.calories !== "number" &&
      hydrationNeedsNutritionEstimate(entry.description))
  ).slice(0, 3);
  for (const entry of pending) {
    const completed = await retryEstimateEntry(entry.id, { announceStart: false, announceSuccess: false });
    if (!completed) break;
  }
}

async function itemizeCurrentEntries() {
  if (!hasCurrentCoreMembership()) return;
  const missing = state.entries.filter((entry) => needsIngredientItemization(entry) || needsMealImpactDetails(entry)).slice(0, 6);
  if (!missing.length) return;
  ingredientItemizationFailed = false;
  if (metricBreakdownCurrentMetric) renderMetricBreakdown(metricBreakdownCurrentMetric);
  for (const entry of missing) {
    if (entry.kind === "meal") {
      const completed = await addMealImpactDetails(entry.id, { announceStart: false, announceSuccess: false });
      if (!completed) {
        ingredientItemizationFailed = true;
        break;
      }
    } else {
      const { error } = await invokeAuthenticated("estimate-entry", { body: { entryId: entry.id, itemizeExisting: true } });
      if (error) {
        ingredientItemizationFailed = true;
        break;
      }
    }
  }
  await loadLedger();
  if (metricBreakdownCurrentMetric) renderMetricBreakdown(metricBreakdownCurrentMetric);
}

document.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => startCheckout(button.dataset.plan)));

$("#today-metrics").addEventListener("click", (event) => {
  const button = event.target.closest("[data-metric]");
  if (button) openMetricBreakdown(button.dataset.metric, button);
});
document.querySelectorAll("[data-close-metric-breakdown]").forEach((button) => button.addEventListener("click", closeMetricBreakdown));
$("#open-weight-panel").addEventListener("click", (event) => openWeightPanel(event.currentTarget));
document.querySelectorAll("[data-close-weight-panel]").forEach((button) => button.addEventListener("click", closeWeightPanel));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#metric-breakdown").hidden) closeMetricBreakdown();
  if (event.key === "Escape" && !$("#leftover-adjustment").hidden) closeLeftoverAdjustment();
  if (event.key === "Escape" && !$("#weight-panel").hidden) closeWeightPanel();
});

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
  await loadProfile();
  await Promise.all([loadLedger(), loadMembership(), loadFeedback(), loadWeightEntries()]);
  state.savedFoodsApi = await initializeSavedFoods({
    supabase,
    invokeAuthenticated,
    user,
    defaultMealLabel,
    toast,
    hasCurrentCoreMembership,
    showMembershipPrompt: showEstimateMembershipPrompt,
    onLedgerChange: loadLedger
  });
  await loadLedger();
  const weeklyReportButton = document.querySelector('[data-report-period="weekly"]');
  await generateReport("weekly", weeklyReportButton);
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
  void itemizeCurrentEntries();
} catch (error) { toast(error.message); }
