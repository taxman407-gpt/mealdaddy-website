import { supabase, requireSession } from "./supabase-client.js";

const dietStyles = ["Mediterranean", "Low-carb", "Pescatarian", "DASH", "Vegetarian", "High-protein", "Flexible"];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const session = await requireSession();
if (!session) throw new Error("Authentication required");

const user = session.user;
const allowedPlans = new Set(["core", "byo"]);
const mealLabels = new Set(["Breakfast", "Brunch", "Lunch", "Dinner", "Snack"]);
const query = new URLSearchParams(location.search);
let pendingPlan = allowedPlans.has(query.get("plan")) ? query.get("plan") : null;
const checkoutResult = query.get("checkout");
const state = { diet: "", tone: "supportive", provider: "best_value", entries: [], photo: null };
document.body.classList.remove("auth-loading");
$("#account-email").textContent = user.email || "Signed in";
$("#greeting").textContent = `Welcome back${user.user_metadata?.first_name ? `, ${user.user_metadata.first_name}` : ""}.`;
$("#today-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());

function defaultMealLabel(date = new Date()) {
  const hour = date.getHours();
  if (hour < 10) return "Breakfast";
  if (hour < 12) return "Brunch";
  if (hour < 16) return "Lunch";
  if (hour < 21) return "Dinner";
  return "Snack";
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
  if (goals.length) $("#goal-summary").textContent = `Today's focus: ${goals.join(" · ")}`;
  const calorieGoal = Number(profile.calorie_goal || 2050);
  const proteinGoal = Number(profile.protein_goal || 130);
  $("#energy-progress").max = calorieGoal;
  $("#protein-progress").max = proteinGoal;
  $("#energy-goal-label").textContent = `of ${calorieGoal.toLocaleString()} cal`;
  $("#protein-goal-label").textContent = `of ${proteinGoal}g`;
  $("#profile-diet").textContent = state.diet;
  $("#tone-options").value = state.tone;
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
  if (!data) return;

  const membershipIsCurrent = ["trialing", "active", "past_due"].includes(data.status);
  if (!membershipIsCurrent) return;

  const planName = data.plan_key === "byo" ? "Bring Your Own API" : "Meal Daddy Core";
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
    const meta = entry.kind === "hydration" ? `${estimate.ounces || 0} fl oz` : entry.status === "pending_estimate" ? "Estimate pending" : `${estimate.calories || 0} cal`;
    const label = entry.kind === "hydration" ? "Hydration" : mealLabels.has(entry.meal_label) ? entry.meal_label : "Meal";
    const ledgerIcon = entry.kind === "hydration" ? "W" : mealLabels.has(entry.meal_label) ? entry.meal_label.charAt(0) : "M";
    const edit = entry.kind === "meal"
      ? `<button class="ledger-edit-button" type="button" data-edit-entry="${entry.id}" aria-label="Edit ${escapeHtml(label)}">Edit</button>`
      : "";
    const editor = entry.kind === "meal"
      ? `<form class="ledger-edit-form" data-edit-form="${entry.id}" hidden>
          <label><span>Meal</span><select name="meal_label">${[...mealLabels].map((option) => `<option${option === entry.meal_label ? " selected" : ""}>${option}</option>`).join("")}</select></label>
          <label><span>Description</span><input name="description" value="${escapeHtml(entry.description)}" required maxlength="1200" /></label>
          <div><button class="button button-primary" type="submit">Save</button><button class="button button-quiet" type="button" data-cancel-edit="${entry.id}">Cancel</button></div>
        </form>`
      : "";
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
    sum.calories += Number(n.calories || 0); sum.protein += Number(n.protein_g || 0); sum.fiber += Number(n.fiber_g || 0); sum.water += Number(n.ounces || 0);
    return sum;
  }, { calories: 0, protein: 0, fiber: 0, water: 0 });
  $("#energy-total").textContent = Math.round(totals.calories).toLocaleString();
  $("#protein-total").textContent = `${Math.round(totals.protein)}g`;
  $("#fiber-total").textContent = `${Math.round(totals.fiber)}g`;
  $("#water-total").textContent = `${Math.round(totals.water)}oz`;
  $("#energy-progress").value = totals.calories; $("#protein-progress").value = totals.protein; $("#fiber-progress").value = totals.fiber; $("#water-progress").value = totals.water;
}

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
$("#open-profile").addEventListener("click", showOnboarding);
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

$("#ledger-list").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-entry]");
  const cancelButton = event.target.closest("[data-cancel-edit]");
  if (editButton) {
    $(`[data-edit-form="${editButton.dataset.editEntry}"]`).hidden = false;
    editButton.hidden = true;
  }
  if (cancelButton) {
    $(`[data-edit-form="${cancelButton.dataset.cancelEdit}"]`).hidden = true;
    $(`[data-edit-entry="${cancelButton.dataset.cancelEdit}"]`).hidden = false;
  }
});

$("#ledger-list").addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-edit-form]");
  if (!form) return;
  event.preventDefault();
  const entry = state.entries.find((item) => item.id === form.dataset.editForm && item.kind === "meal");
  if (!entry) return;
  const formData = new FormData(form);
  const description = String(formData.get("description") || "").trim();
  const mealLabel = String(formData.get("meal_label") || "");
  if (!description || !mealLabels.has(mealLabel)) {
    toast("Choose a meal label and enter a description.");
    return;
  }
  const descriptionChanged = description !== entry.description;
  const saveButton = form.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  const changes = { description, meal_label: mealLabel };
  if (descriptionChanged) {
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
  if (descriptionChanged) {
    toast("Meal updated. Recalculating nutrition...");
    const { error: estimateError } = await supabase.functions.invoke("estimate-entry", { body: { entryId: entry.id } });
    await loadLedger();
    toast(estimateError ? "Meal updated. Nutrition estimate is pending." : "Meal and nutrition estimate updated.");
  } else {
    toast("Meal label updated.");
  }
});

$("#entry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#quick-entry"); const description = input.value.trim() || (state.photo ? "Meal photo" : "New meal");
  const hydrationMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?(?:oz|ounces?)/i);
  const kind = /water|hydration|drink/i.test(description) && hydrationMatch ? "hydration" : "meal";
  let photoPath = null;
  if (state.photo) {
    const safeName = state.photo.name.replace(/[^a-z0-9._-]/gi, "-"); photoPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("meal-photos").upload(photoPath, state.photo, { upsert: false });
    if (uploadError) { toast(`Photo was not uploaded: ${uploadError.message}`); return; }
  }
  const nutrition = kind === "hydration" ? { ounces: Number(hydrationMatch[1]) } : photoPath ? { photo_path: photoPath } : null;
  const mealLabel = mealLabels.has($("#meal-label").value) ? $("#meal-label").value : defaultMealLabel();
  const { data: savedEntry, error } = await supabase.from("ledger_entries")
    .insert({ user_id: user.id, client_request_id: crypto.randomUUID(), kind, occurred_at: new Date().toISOString(), description, meal_label: kind === "meal" ? mealLabel : null, nutrition_estimate: nutrition, status: kind === "hydration" ? "estimated" : "pending_estimate" })
    .select("id")
    .single();
  if (error) { toast(error.message); return; }
  input.value = ""; state.photo = null; $("#photo-input").value = "";
  await loadLedger();
  if (kind === "meal") {
    toast("Meal saved. Estimating nutrition...");
    const { error: estimateError } = await supabase.functions.invoke("estimate-entry", { body: { entryId: savedEntry.id } });
    await loadLedger();
    toast(estimateError ? "Meal saved, but the estimate needs another try." : "Nutrition estimate ready.");
  } else {
    toast("Saved to your private daily ledger.");
  }
});

async function estimatePendingEntries() {
  const pending = state.entries.filter((entry) => entry.kind === "meal" && entry.status === "pending_estimate").slice(0, 3);
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

$("#refresh-ledger").addEventListener("click", () => loadLedger().catch((error) => toast(error.message)));
$("#sign-out").addEventListener("click", async () => { await supabase.auth.signOut(); location.replace("./auth.html"); });
supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") location.replace("./auth.html"); });

try {
  await Promise.all([loadProfile(), loadLedger(), loadMembership()]);
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
