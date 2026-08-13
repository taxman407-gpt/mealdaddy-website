const ledger = document.querySelector("#sandbox-ledger");
const escapeHtml = (value = "") => String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);

const sampleEntries = [
  { label: "Breakfast", icon: "B", description: "Two scrambled eggs, avocado, and coffee", calories: 465, source: "Description estimate", confidence: "medium", uncertainty: "The amount of avocado and cooking fat are the main uncertainty.", favorite: "exact" },
  { label: "Lunch", icon: "L", description: "Dinner salad with grilled chicken and vinaigrette", calories: 520, source: "Photo estimate", confidence: "medium", uncertainty: "Dressing quantity and the portion hidden beneath the greens can change the estimate.", favorite: "edited" },
  { label: "Snack", icon: "S", description: "Greek yogurt with blueberries", calories: 260, source: "Label-informed", confidence: "high", uncertainty: "Accuracy depends on the photographed serving and the amount actually eaten.", favorite: null }
];

function entryHtml(entry) {
  const favorite = entry.favorite === "exact"
    ? '<span class="ledger-favorite-status"><span aria-hidden="true">🍎</span><span>Favorite</span></span>'
    : entry.favorite === "edited"
      ? '<span class="ledger-favorite-status ledger-favorite-edited"><span aria-hidden="true">🍎</span><span>Edited favorite</span></span><span class="ledger-favorite-choices"><button type="button" data-sandbox-favorite="update">Update favorite</button><button type="button" data-sandbox-favorite="new">Save as new</button></span>'
      : '<button class="ledger-favorite-button" type="button" data-sandbox-favorite="new">Save as favorite</button>';
  return `<li class="ledger-item"><span class="ledger-icon" aria-hidden="true">${entry.icon}</span><span class="ledger-main"><strong>${escapeHtml(entry.description)}</strong></span><span class="ledger-actions"><small>${entry.calories} cal</small><em class="ledger-source-badge">${escapeHtml(entry.source)}</em>${favorite}<button class="ledger-edit-button" type="button" data-sandbox-edit>Edit</button></span><details class="ledger-trust-details"><summary>How reliable is this?</summary><div><p><strong>${escapeHtml(entry.source)} · ${escapeHtml(entry.confidence)} confidence</strong>MealDaddy explains where the values came from.</p><p><strong>Main uncertainty</strong>${escapeHtml(entry.uncertainty)}</p><button type="button" data-sandbox-edit>Correct this entry</button></div></details></li>`;
}

function render() { ledger.innerHTML = sampleEntries.map(entryHtml).join(""); }
render();

document.querySelectorAll("[data-sandbox-metric]").forEach((button) => button.addEventListener("click", () => {
  document.querySelector("#sandbox-metric-result").textContent = `${button.dataset.sandboxMetric}: this preview would open a food-by-food contribution panel in the signed-in app.`;
}));

document.querySelectorAll("[data-sandbox-plan]").forEach((button) => button.addEventListener("click", () => {
  const restaurant = button.dataset.sandboxPlan === "restaurant";
  const result = document.querySelector("#sandbox-guidance");
  result.hidden = false;
  result.textContent = restaurant
    ? "Restaurant preview: A) grilled salmon with vegetables; B) bunless burger with side salad; C) entrée of your choice with sauce on the side. In the signed-in app, current menu sources and personalized estimates appear here."
    : "Home preview: roast chicken or salmon with broccoli and a simple side salad. This adds protein and fiber without pushing the fictional day far beyond its targets.";
}));

document.querySelector("#sandbox-entry-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#sandbox-entry");
  sampleEntries.push({ label: "Dinner", icon: "D", description: input.value.trim(), calories: 430, source: "Sandbox estimate", confidence: "medium", uncertainty: "This demonstration uses a fixed sample estimate and does not contact AI.", favorite: null });
  input.value = "";
  render();
});

ledger.addEventListener("click", (event) => {
  const favorite = event.target.closest("[data-sandbox-favorite]");
  if (favorite) {
    favorite.closest(".ledger-actions").insertAdjacentHTML("beforeend", '<small class="sandbox-action-note">Sandbox choice recorded.</small>');
    favorite.closest(".ledger-favorite-choices")?.remove();
    favorite.remove();
  }
  if (event.target.closest("[data-sandbox-edit]")) window.alert("In the signed-in app, this opens the entry editor. The sandbox does not save changes.");
});

document.querySelectorAll("[data-sandbox-report]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-sandbox-report]").forEach((item) => item.classList.toggle("is-active", item === button));
  document.querySelector("#sandbox-report-result").textContent = `${button.dataset.sandboxReport} sample selected. The full report remains available in the signed-in app.`;
}));

document.querySelectorAll("[data-sandbox-message]").forEach((button) => button.addEventListener("click", () => {
  const toast = document.querySelector("#sandbox-toast");
  toast.textContent = button.dataset.sandboxMessage;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 3500);
}));
