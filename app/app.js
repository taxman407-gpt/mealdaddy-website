const dietStyles = [
  "Mediterranean", "Low-carb", "Pescatarian", "DASH",
  "Vegetarian", "High-protein", "Flexible"
];

const demoLedger = [
  { icon: "", label: "Breakfast", detail: "Eggs, spinach & sourdough", meta: "410 cal - 28g protein" },
  { icon: "", label: "Water", detail: "20 fl oz", meta: "9:42 AM" },
  { icon: "", label: "Lunch", detail: "Chicken grain bowl", meta: "620 cal - 43g protein" }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  diet: sessionStorage.getItem("mealdaddy.preview.diet") || "",
  tone: sessionStorage.getItem("mealdaddy.preview.tone") || "Supportive",
  onboarded: sessionStorage.getItem("mealdaddy.preview.onboarded") === "true"
};

function renderDietChoices() {
  $("#diet-options").innerHTML = dietStyles.map((diet) =>
    `<button class="choice-chip ${state.diet === diet ? "is-selected" : ""}" type="button" data-diet="${diet}" aria-pressed="${state.diet === diet}">${diet}</button>`
  ).join("");
}

function renderLedger() {
  $("#ledger-list").innerHTML = demoLedger.map((item) => `
    <li class="ledger-item">
      <span class="ledger-icon" aria-hidden="true">${item.icon}</span>
      <span><strong>${item.label}</strong><small>${item.detail}</small></span>
      <small>${item.meta}</small>
    </li>
  `).join("");
}

function showOnboarding() {
  $("#onboarding").hidden = false;
  document.body.classList.add("modal-open");
  renderDietChoices();
}

function closeOnboarding() {
  $("#onboarding").hidden = true;
  document.body.classList.remove("modal-open");
}

$("#diet-options").addEventListener("click", (event) => {
  const choice = event.target.closest("[data-diet]");
  if (!choice) return;
  state.diet = choice.dataset.diet;
  renderDietChoices();
  $("#continue-onboarding").disabled = false;
});

$("#tone-options").addEventListener("change", (event) => {
  state.tone = event.target.value;
});

$("#continue-onboarding").addEventListener("click", () => {
  sessionStorage.setItem("mealdaddy.preview.diet", state.diet);
  sessionStorage.setItem("mealdaddy.preview.tone", state.tone);
  sessionStorage.setItem("mealdaddy.preview.onboarded", "true");
  state.onboarded = true;
  $("#profile-diet").textContent = state.diet;
  closeOnboarding();
  toast(`Your ${state.diet} plan is ready.`);
});

$("#open-profile").addEventListener("click", showOnboarding);

$$("[data-entry-mode]").forEach((button) => button.addEventListener("click", () => {
  $$("[data-entry-mode]").forEach((item) => item.classList.remove("is-active"));
  button.classList.add("is-active");
  const mode = button.dataset.entryMode;
  const input = $("#quick-entry");
  input.placeholder = mode === "voice" ? "Voice preview - tap Log to simulate" :
    mode === "photo" ? "Photo preview - describe anything not visible" :
    "e.g. turkey sandwich, apple, and sparkling water";
  input.focus();
}));

$("#entry-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#quick-entry");
  const description = input.value.trim() || "New meal";
  demoLedger.unshift({ icon: "+", label: "Just logged", detail: description, meta: "Estimating" });
  renderLedger();
  input.value = "";
  toast("Saved instantly. Nutrition estimate is processing.");
});

$("#photo-input").addEventListener("change", (event) => {
  if (!event.target.files.length) return;
  $("#quick-entry").value = event.target.files[0].name;
  toast("Photo ready to log. It stays on this device in the preview.");
});

$$('input[name="provider"]').forEach((input) => input.addEventListener("change", (event) => {
  sessionStorage.setItem("mealdaddy.preview.provider", event.target.value);
  toast("AI provider preference saved for this preview session.");
}));

const savedProvider = sessionStorage.getItem("mealdaddy.preview.provider");
if (savedProvider) {
  const providerInput = document.querySelector(`input[name="provider"][value="${savedProvider}"]`);
  if (providerInput) providerInput.checked = true;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("is-visible"), 2600);
}

renderLedger();
$("#profile-diet").textContent = state.diet || "Set diet";
if (!state.onboarded || location.hash === "#onboarding") showOnboarding();

