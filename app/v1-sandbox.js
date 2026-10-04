const screen = document.querySelector("#test-screen");
const toast = document.querySelector("#test-toast");
const key = "mealdaddy-v1-sandbox-state";
const dateValue = (daysAgo = 0) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
};
const todayDate = dateValue();
const sevenDayStart = dateValue(6);
const seed = {
  view: "log",
  priorView: "log",
  preferredName: "Steve",
  optionalEmailUnsubscribed: false,
  style: "Low Carb",
  goals: ["Lose weight", "Eat healthier"],
  targets: {
    calories: 2050,
    protein: 130,
    carbs: 75,
    netCarbs: 50,
    fat: 100,
    fiber: 30,
    water: 90,
  },
  entries: [
    {
      id: "b1",
      label: "Breakfast",
      icon: "B",
      description: "Eggs, avocado, and coffee",
      calories: 465,
      protein: 25,
      carbs: 18,
      netCarbs: 10,
      fat: 31,
      fiber: 8,
      water: 8,
      favorite: true,
      source: "reviewed values",
    },
    {
      id: "l1",
      label: "Lunch",
      icon: "L",
      description: "Chicken salad with vinaigrette",
      calories: 520,
      protein: 38,
      carbs: 21,
      netCarbs: 12,
      fat: 27,
      fiber: 7,
      water: 10,
      favorite: true,
      source: "photo estimate",
      photo: true,
    },
    {
      id: "s1",
      label: "Snack",
      icon: "S",
      description: "Greek yogurt with berries",
      calories: 260,
      protein: 23,
      carbs: 17,
      netCarbs: 12,
      fat: 3,
      fiber: 2,
      water: 4,
      favorite: true,
      source: "label-informed",
    },
  ],
  foods: [
    {
      id: "f1",
      name: "Grilled salmon & vegetables",
      detail: "Harbor Grill · customized order",
      calories: 610,
      protein: 42,
      favorite: true,
      restaurant: true,
      recipe:
        "Season salmon with pepper and lemon. Grill until just cooked. Serve with roasted broccoli and zucchini; keep sauce on the side.",
    },
    {
      id: "f2",
      name: "Low-carb salmon plate",
      detail: "Generated at-home recipe",
      calories: 510,
      protein: 45,
      favorite: true,
      recipe:
        "Roast salmon at 425°F for 10–12 minutes. Add broccoli tossed with olive oil. Finish with lemon and herbs.",
    },
    {
      id: "f3",
      name: "Greek yogurt",
      detail: "Nutrition label · 1 cup",
      calories: 140,
      protein: 15,
      favorite: true,
      recipe: "",
    },
  ],
  feedback: {
    rating: 4,
    comment: "I like the clearer daily guidance.",
    history: [
      {
        rating: 4,
        comment: "I like the clearer daily guidance.",
        date: "Sample start",
      },
    ],
  },
  weights: [218, 214, 211],
  reportPeriod: "week",
};
let state;
try {
  state = {
    ...structuredClone(seed),
    ...JSON.parse(localStorage.getItem(key) || "{}"),
  };
} catch {
  state = structuredClone(seed);
}
// Each fresh app launch opens the fastest meal-entry screen. Stored meals,
// preferences, feedback, and favorites remain untouched.
state.view = "log";
state.priorView = "log";
state.entryDate = state.entryDate || todayDate;
state.entries.forEach((entry) => {
  entry.date = entry.date || todayDate;
});
if (!state.entries.some((entry) => entry.date !== todayDate)) {
  state.entries.push({
    id: "prior-dinner",
    date: dateValue(1),
    label: "Dinner",
    icon: "D",
    description: "Grilled salmon, broccoli, and side salad",
    calories: 610,
    protein: 42,
    carbs: 22,
    netCarbs: 14,
    fat: 34,
    fiber: 8,
    water: 12,
    favorite: true,
    source: "photo estimate",
    photo: true,
  });
}
const esc = (v = "") =>
  String(v).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const save = () => localStorage.setItem(key, JSON.stringify(state));
const say = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(say.timer);
  say.timer = setTimeout(() => toast.classList.remove("show"), 2600);
};
const totals = (date = todayDate) =>
  state.entries.filter((entry) => entry.date === date).reduce(
    (a, e) => {
      for (const k of [
        "calories",
        "protein",
        "carbs",
        "netCarbs",
        "fat",
        "fiber",
        "water",
      ])
        a[k] += Number(e[k] || 0);
      return a;
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      netCarbs: 0,
      fat: 0,
      fiber: 0,
      water: 0,
    },
  );
const metricRow = (label, value, goal, unit = "") =>
  `<div class="metric"><span>${label}</span><span class="track"><i class="${value > goal ? "over" : ""}" style="width:${Math.min(100, (value / goal) * 100)}%"></i></span><strong>${Math.round(value).toLocaleString()} / ${goal.toLocaleString()}${unit}</strong></div>`;
const navigate = (view) => {
  state.priorView = state.view;
  state.view = view;
  save();
  render();
};
function today() {
  const t = totals();
  return `<section><div class="screen-title"><div><p class="eyebrow">Today</p><h1>Your day at a glance</h1></div><span class="pill">${esc(state.style)}</span></div><div class="metrics">${metricRow("Calories", t.calories, state.targets.calories)}${metricRow("Protein", t.protein, state.targets.protein, "g")}${metricRow("Total carbs", t.carbs, state.targets.carbs, "g")}${metricRow("Net carbs", t.netCarbs, state.targets.netCarbs, "g")}${metricRow("Fat", t.fat, state.targets.fat, "g")}${metricRow("Fiber", t.fiber, state.targets.fiber, "g")}${metricRow("Water", t.water, state.targets.water, "oz")}</div><aside class="ai-card"><strong>${esc(state.preferredName)}, here’s how your day is shaping up</strong><p>You have about ${Math.max(0, state.targets.protein - t.protein)}g protein, ${Math.max(0, state.targets.fiber - t.fiber)}g fiber, and ${Math.max(0, state.targets.water - t.water)} oz hydration remaining.</p><ul><li><b>Eating at home?</b> Use Plan Next Meal for a protein-centered dinner.</li><li><b>Going out?</b> Restaurant Mode will compare choices and suggest substitutions.</li><li><b>Next:</b> choose the tool that fits your evening.</li></ul><div class="two-actions"><button class="button primary" data-nav="plan">Plan next meal</button><button class="button" data-action="restaurant">Restaurant Mode</button></div></aside><div class="actions"><button class="button" data-nav="entries">Today’s Entries</button><button class="button" data-nav="foods">My Saved Favorites</button></div></section>`;
}
function log() {
  return `<section><p class="eyebrow">Quick log</p><h1>What did you have?</h1><div class="field-grid"><label class="field">Meal<select id="log-label"><option>Breakfast</option><option>Lunch</option><option selected>Dinner</option><option>Snack</option></select></label><label class="field">Date<input id="log-date" type="date" min="${sevenDayStart}" max="${todayDate}" value="${todayDate}"></label></div><label class="field">Meal description<input id="log-description" placeholder="Describe the meal or clarify the photo"></label><input class="file-input" id="meal-photo" type="file" accept="image/*" capture="environment"><div class="mode-row"><button data-action="type">Type</button><button data-action="speak">Speak</button><button data-action="photo">Photo</button></div><button class="button primary" data-action="add-entry">Add to selected date</button><p class="status" id="log-status"></p><p class="sub">A photo creates one written entry. Measurements and notes clarify the pictured meal rather than becoming a second entry.</p><button class="choice" data-nav="foods"><b>🍎</b><span><strong>My Saved Favorites</strong><small>My Foods and restaurant meals</small></span></button></section>`;
}
function entries() {
  const selected = state.entries.filter((entry) => entry.date === state.entryDate);
  const dateLabel = state.entryDate === todayDate
    ? "Today’s Entries"
    : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date(`${state.entryDate}T12:00:00`));
  return `<section><p class="eyebrow">Entries · Last 7 days</p><h1>${dateLabel}</h1><label class="field">Choose a day<input id="entries-date" type="date" min="${sevenDayStart}" max="${todayDate}" value="${state.entryDate}"></label><p class="sub">Tap any meal to open and correct it. Photo-based meals can also use an after-meal photo.</p>${selected.length ? selected.map((e) => `<div><button class="entry" data-edit-entry="${e.id}"><b>${e.icon}</b><span><strong>${esc(e.description)}</strong><small>${Math.round(e.calories)} cal · ${esc(e.source)}</small></span>${e.favorite ? '<span class="apple">🍎</span>' : ""}</button>${e.photo ? `<div class="entry-followup"><button class="inline-link" data-leftover="${e.id}">Add after / leftover photo</button></div>` : ""}</div>`).join("") : '<p class="sub">No entries were logged on this day.</p>'}<input class="file-input" id="leftover-photo" type="file" accept="image/*" capture="environment"></section>`;
}
function entryEditor() {
  const e = state.entries.find((x) => x.id === state.editingEntry);
  if (!e) return entries();
  return `<section><button class="back" data-nav="entries">← Today’s Entries</button><p class="eyebrow">Edit entry</p><h1>${esc(e.label)}</h1><label class="field">Description<input id="edit-description" value="${esc(e.description)}"></label><div class="field-grid"><label class="field">Calories<input id="edit-calories" type="number" value="${e.calories}"></label><label class="field">Protein (g)<input id="edit-protein" type="number" value="${e.protein}"></label></div><label class="field"><span><input id="edit-favorite" type="checkbox" ${e.favorite ? "checked" : ""}> Saved favorite 🍎</span></label><div class="actions"><button class="button primary" data-action="save-entry">Save changes</button><button class="button danger" data-action="delete-entry">Delete entry</button></div></section>`;
}
function plan() {
  return `<section><p class="eyebrow">Plan</p><h1>What should I eat next?</h1><p class="sub">Choose one focused tool.</p><button class="choice" data-action="restaurant"><b>R</b><span><strong>Restaurant Mode</strong><small>Current menu choices, nutrition, and substitutions</small></span></button><button class="choice" data-nav="home-plan"><b>K</b><span><strong>Plan from my kitchen</strong><small>Use what I have and today’s needs</small></span></button><button class="choice" data-nav="recreate"><b>🍎</b><span><strong>Recreate a favorite</strong><small>Make a restaurant-inspired recipe or variation</small></span></button></section>`;
}
function restaurant() {
  return `<section><button class="back" data-nav="plan">← Plan</button><p class="eyebrow">Restaurant Mode</p><h1>Where are you eating?</h1><label class="field">Restaurant or cuisine<input id="restaurant-name" value="Harbor Grill"></label><button class="button primary" data-action="find-restaurant">Find personalized choices</button><div id="restaurant-results"></div></section>`;
}
function homePlan() {
  return `<section><button class="back" data-nav="plan">← Plan</button><p class="eyebrow">Plan from my kitchen</p><h1>Build my next meal</h1><label class="field">What do you have or want?<textarea id="kitchen-context" placeholder="Chicken, broccoli, 25 minutes"></textarea></label><button class="button primary" data-action="generate-home">Generate meal plan</button><div id="home-result"></div></section>`;
}
function recreate() {
  return `<section><button class="back" data-nav="plan">← Plan</button><p class="eyebrow">Recipes & replacements</p><h1>Recreate a favorite</h1><p class="sub">Choose a saved restaurant meal to generate an at-home recipe or dietary variation.</p>${state.foods
    .filter((f) => f.restaurant)
    .map(
      (f) =>
        `<button class="choice" data-recreate="${f.id}"><b>🍎</b><span><strong>${esc(f.name)}</strong><small>${esc(f.detail)}</small></span></button>`,
    )
    .join("")}<div id="recreate-result"></div></section>`;
}
const reportData = {
  week: {
    label: "7 Days",
    logged: "6 of 7 logged",
    mult: 1,
    summary:
      "You stayed within your net-carb ceiling on five of six logged days.",
  },
  month: {
    label: "Month",
    logged: "27 of 30 logged",
    mult: 1.04,
    summary:
      "Restaurant days produced most of the higher-carb totals this month.",
  },
  year: {
    label: "Year",
    logged: "310 of 365 logged",
    mult: 1.1,
    summary:
      "Protein, fiber, and hydration are the clearest long-term opportunities.",
  },
};
function reports() {
  const p = reportData[state.reportPeriod],
    t = totals(),
    avg = {};
  for (const k of Object.keys(state.targets))
    avg[k] = Math.round(t[k] * p.mult);
  return `<section><div class="screen-title"><div><p class="eyebrow">Reports</p><h1>Your daily averages</h1></div><span class="pill">${p.logged}</span></div><div class="periods">${Object.entries(
    reportData,
  )
    .map(
      ([k, v]) =>
        `<button class="${k === state.reportPeriod ? "is-active" : ""}" data-period="${k}">${v.label}</button>`,
    )
    .join(
      "",
    )}</div><div class="focus-tags"><span>${esc(state.style)}</span>${state.goals.map((g) => `<span>${esc(g)}</span>`).join("")}<span>Protein</span><span>Hydration</span></div><div class="metrics">${metricRow("Calories", avg.calories, state.targets.calories)}${metricRow("Protein", avg.protein, state.targets.protein, "g")}${metricRow("Total carbs", avg.carbs, state.targets.carbs, "g")}${metricRow("Net carbs", avg.netCarbs, state.targets.netCarbs, "g")}${metricRow("Fat", avg.fat, state.targets.fat, "g")}${metricRow("Fiber", avg.fiber, state.targets.fiber, "g")}${metricRow("Water", avg.water, state.targets.water, "oz")}</div><aside class="ai-card"><strong>${esc(state.preferredName)}, your setup priorities are showing in this trend</strong><p>${p.summary}</p><ul><li><b>Next focus:</b> use Plan or Restaurant Mode before the meal that is hardest to predict.</li></ul></aside></section>`;
}
function foods() {
  return `<section><button class="back" data-nav="more">← More</button><p class="eyebrow">My Foods</p><h1>Favorites & saved recipes</h1><div class="favorite-grid">${state.foods.map((f) => `<button class="choice" data-food="${f.id}"><b>${f.favorite ? "🍎" : "F"}</b><span><strong>${esc(f.name)}</strong><small>${esc(f.detail)} · ${f.calories} cal</small></span></button>`).join("")}</div></section>`;
}
function foodDetail() {
  const f = state.foods.find((x) => x.id === state.foodId);
  if (!f) return foods();
  return `<section><button class="back" data-nav="foods">← My Foods</button><p class="eyebrow">Saved food</p><h1>${esc(f.name)}</h1><p class="sub">${esc(f.detail)} · ${f.calories} cal · ${f.protein}g protein</p>${f.recipe ? `<article class="recipe"><h3>Recipe</h3><p>${esc(f.recipe)}</p></article>` : ""}<div class="recipe-actions"><button class="button primary" data-log-food="${f.id}">Add to Today’s Entries</button>${f.recipe ? `<button class="button" data-copy-recipe="${f.id}">Copy recipe</button>` : ""}<button class="button" data-toggle-favorite="${f.id}">${f.favorite ? "Remove favorite" : "🍎 Save as favorite"}</button></div></section>`;
}
function more() {
  return `<section><p class="eyebrow">More</p><h1>Everything else</h1><p class="sub">Tap a full row to open it.</p><button class="choice" data-nav="foods"><b>F</b><span><strong>My Foods</strong><small>Labels, favorites, restaurant meals</small></span></button><button class="choice" data-nav="reports"><b>R</b><span><strong>Reports</strong><small>Seven days, month, and year</small></span></button><button class="choice" data-nav="weight"><b>W</b><span><strong>Weight & progress</strong><small>Measurements and trend</small></span></button><button class="choice" data-nav="account"><b>A</b><span><strong>Profile & account</strong><small>Preferences and email updates</small></span></button></section>`;
}
function weightChart() {
  const values = state.weights.map(Number).filter(Number.isFinite);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const width = 360;
  const height = 130;
  const left = 28;
  const right = 18;
  const top = 18;
  const bottom = 28;
  const x = (index) => left + (index * (width - left - right)) / Math.max(1, values.length - 1);
  const y = (value) => top + ((max - value) * (height - top - bottom)) / Math.max(1, max - min);
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  return `<div class="weight-chart-wrap"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Weight changed from ${values[0]} pounds to ${values.at(-1)} pounds across ${values.length} measurements"><line class="weight-grid-line" x1="${left}" y1="${top}" x2="${width-right}" y2="${top}"></line><line class="weight-grid-line" x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}"></line><text class="weight-axis-label" x="0" y="${top+4}">${Math.round(max)}</text><text class="weight-axis-label" x="0" y="${height-bottom+4}">${Math.round(min)}</text><polyline class="weight-line" points="${points}"></polyline>${values.map((value,index)=>`<circle class="weight-point" cx="${x(index)}" cy="${y(value)}" r="5"></circle><text class="weight-label" x="${x(index)}" y="${Math.max(12,y(value)-10)}">${value}</text>`).join("")}<text class="weight-axis-label" x="${left}" y="${height-5}">Starting</text><text class="weight-axis-label" x="${width-right-30}" y="${height-5}">Latest</text></svg></div>`;
}
function weight() {
  const change = Math.round((state.weights.at(-1) - state.weights[0]) * 10) / 10;
  return `<section><button class="back" data-nav="more">← More</button><p class="eyebrow">Weight & progress</p><h1>${state.weights.at(-1)} lb</h1><p class="sub">Starting ${state.weights[0]} lb · Change ${change > 0 ? "+" : ""}${change} lb</p>${weightChart()}<label class="field">Today’s weight<input id="weight-value" type="number" step="0.1" value="${state.weights.at(-1)}"></label><button class="button primary" data-action="save-weight">Save weight</button></section>`;
}
function account() {
  return `<section><button class="back" data-nav="more">← More</button><p class="eyebrow">Profile & account</p><h1>Your choices</h1><button class="choice" data-profile="name"><b>N</b><span><strong>What should I call you?</strong><small>${esc(state.preferredName)}</small></span></button><button class="choice" data-profile="style"><b>P</b><span><strong>Primary style</strong><small>${esc(state.style)}</small></span></button><button class="choice" data-profile="goals"><b>G</b><span><strong>Goals</strong><small>${esc(state.goals.join(", "))}</small></span></button><button class="choice" data-profile="targets"><b>T</b><span><strong>Targets</strong><small>${state.targets.calories} cal · ${state.targets.protein}g protein</small></span></button><button class="choice" data-nav="email"><b>@</b><span><strong>Stay in touch</strong><small>Your account email is used automatically</small></span></button></section>`;
}
function profileEdit() {
  const kind = state.profileKind;
  if (kind === "name")
    return `<section><button class="button" data-nav="account">← Back to Profile & Account</button><h1>What should I call you?</h1><label class="field">First name or nickname<input id="profile-name" value="${esc(state.preferredName)}"></label><button class="button primary" data-action="save-profile">Save</button></section>`;
  if (kind === "style")
    return `<section><button class="button" data-nav="account">← Back to Profile & Account</button><h1>Primary eating style</h1><label class="field">Style<select id="profile-style">${["Low Carb", "Mediterranean", "Low Inflammation", "Flexible", "High Protein"].map((x) => `<option ${x === state.style ? "selected" : ""}>${x}</option>`).join("")}</select></label><button class="button primary" data-action="save-profile">Save</button></section>`;
  if (kind === "goals")
    return `<section><button class="button" data-nav="account">← Back to Profile & Account</button><h1>Goals</h1><label class="field">Goals<input id="profile-goals" value="${esc(state.goals.join(", "))}"></label><button class="button primary" data-action="save-profile">Save</button></section>`;
  return `<section><button class="button" data-nav="account">← Back to Profile & Account</button><h1>Daily targets</h1><div class="field-grid"><label class="field">Calories<input id="target-calories" type="number" value="${state.targets.calories}"></label><label class="field">Protein<input id="target-protein" type="number" value="${state.targets.protein}"></label></div><button class="button primary" data-action="save-profile">Save</button></section>`;
}
function email() {
  const stopped = Boolean(state.optionalEmailUnsubscribed);
  return `<section><button class="button" data-nav="account">← Back to Profile & Account</button><p class="eyebrow">Stay in touch</p><h1>MealDaddy email updates</h1><div class="card"><strong>Your account email is added automatically.</strong><p>MealDaddy may use it for occasional product updates, recipes, and service news.</p><p>Every optional email will include an unsubscribe link so you can stop these messages at any time.</p></div><p class="sub">Essential account and security messages are separate and may still be sent when needed.</p><button class="button ${stopped ? "primary" : ""}" data-action="toggle-email-updates">${stopped ? "Receive optional updates again" : "Unsubscribe from optional updates"}</button><p class="sub">Current status: <strong>${stopped ? "Optional updates stopped" : "Optional updates active"}</strong></p></section>`;
}
function feedback() {
  return `<section><button class="back" data-nav="${state.priorView === "feedback" ? "today" : state.priorView}">← Back</button><p class="eyebrow">Feedback</p><h1>Help shape MealDaddy</h1><p class="sub">Your latest response is used for the current rating. Meaningful updates remain in the private history for trends over time.</p><div class="rating">${[1, 2, 3, 4, 5].map((n) => `<button class="${n === state.feedback.rating ? "is-active" : ""}" data-rating="${n}">${n}</button>`).join("")}</div><label class="field">Comments<textarea id="feedback-comment">${esc(state.feedback.comment)}</textarea></label><button class="button primary" data-action="save-feedback">Update rating and comments</button><p class="status">${state.feedback.history.length} historical version${state.feedback.history.length === 1 ? "" : "s"} retained in this test.</p></section>`;
}
const views = {
  today,
  log,
  entries,
  "entry-editor": entryEditor,
  plan,
  restaurant,
  "home-plan": homePlan,
  recreate,
  reports,
  foods,
  "food-detail": foodDetail,
  more,
  weight,
  account,
  "profile-edit": profileEdit,
  email,
  feedback,
};
function render() {
  document.querySelectorAll("[data-nav]").forEach(() => {});
  document
    .querySelectorAll(".top-tabs button")
    .forEach((b) =>
      b.classList.toggle("is-active", b.dataset.nav === state.view),
    );
  screen.innerHTML = (views[state.view] || today)();
  screen.scrollTop = 0;
}
document.addEventListener("click", async (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    navigate(nav.dataset.nav);
    return;
  }
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "type") {
    document.querySelector("#log-description")?.focus();
    return;
  }
  if (action === "speak") {
    const input = document.querySelector("#log-description");
    input.value = "Grilled chicken, roasted vegetables, and 16 oz water";
    document.querySelector("#log-status").textContent =
      "Voice sample added. Review it before saving.";
    return;
  }
  if (action === "photo") {
    document.querySelector("#meal-photo")?.click();
    return;
  }
  if (action === "add-entry") {
    const input = document.querySelector("#log-description");
    if (!input.value.trim()) {
      say("Add a description, voice note, or photo first.");
      return;
    }
    state.entries.push({
      id: crypto.randomUUID(),
      date: document.querySelector("#log-date").value,
      label: document.querySelector("#log-label").value,
      icon: document.querySelector("#log-label").value[0],
      description: input.value.trim(),
      calories: 430,
      protein: 38,
      carbs: 24,
      netCarbs: 15,
      fat: 20,
      fiber: 7,
      water: 16,
      favorite: false,
      source: "test estimate",
      photo: input.dataset.photo === "true",
    });
    save();
    state.entryDate = document.querySelector("#log-date").value;
    say("Added to the selected day’s entries.");
    navigate("entries");
    return;
  }
  if (action === "restaurant") {
    navigate("restaurant");
    return;
  }
  if (action === "find-restaurant") {
    const name =
      document.querySelector("#restaurant-name").value || "Restaurant";
    document.querySelector("#restaurant-results").innerHTML =
      `<div class="recipe"><h3>A · Best fit</h3><p>${esc(name)} grilled salmon, double vegetables, sauce on the side.</p><button class="button primary" data-add-restaurant="${esc(name)}">Add to Today’s Entries</button></div><div class="recipe"><h3>B · Balanced choice</h3><p>Bunless burger, side salad, dressing on the side.</p></div><div class="recipe"><h3>C · Treat option</h3><p>Your preferred entrée with a smaller starch portion and added vegetables.</p></div>`;
    return;
  }
  if (action === "generate-home") {
    document.querySelector("#home-result").innerHTML =
      `<article class="recipe"><h3>25-minute chicken & broccoli plate</h3><p>About 42g protein and 12g net carbs.</p><ol><li>Season and pan-sear chicken.</li><li>Steam broccoli; finish with lemon.</li><li>Add a small salad and water.</li></ol><button class="button primary" data-save-generated>Save as favorite</button><button class="button" data-copy-text="Chicken and broccoli recipe copied">Copy recipe</button></article>`;
    return;
  }
  if (action === "save-entry") {
    const x = state.entries.find((v) => v.id === state.editingEntry);
    x.description = document.querySelector("#edit-description").value;
    x.calories = Number(document.querySelector("#edit-calories").value);
    x.protein = Number(document.querySelector("#edit-protein").value);
    x.favorite = document.querySelector("#edit-favorite").checked;
    save();
    say("Entry updated.");
    navigate("entries");
    return;
  }
  if (action === "delete-entry") {
    state.entries = state.entries.filter((v) => v.id !== state.editingEntry);
    save();
    say("Test entry deleted.");
    navigate("entries");
    return;
  }
  if (action === "save-weight") {
    state.weights.push(Number(document.querySelector("#weight-value").value));
    save();
    say("Weight saved in this test.");
    render();
    return;
  }
  if (action === "save-profile") {
    if (state.profileKind === "name")
      state.preferredName =
        document.querySelector("#profile-name").value.trim() || "Friend";
    if (state.profileKind === "style")
      state.style = document.querySelector("#profile-style").value;
    if (state.profileKind === "goals")
      state.goals = document
        .querySelector("#profile-goals")
        .value.split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    if (state.profileKind === "targets") {
      state.targets.calories = Number(
        document.querySelector("#target-calories").value,
      );
      state.targets.protein = Number(
        document.querySelector("#target-protein").value,
      );
    }
    save();
    say("Preference updated.");
    navigate("account");
    return;
  }
  if (action === "toggle-email-updates") {
    state.optionalEmailUnsubscribed = !state.optionalEmailUnsubscribed;
    save();
    say(
      state.optionalEmailUnsubscribed
        ? "Optional email updates stopped."
        : "Optional email updates resumed.",
    );
    render();
    return;
  }
  if (action === "save-feedback") {
    const next = {
      rating: state.feedback.rating,
      comment: document.querySelector("#feedback-comment").value.trim(),
      date: new Date().toLocaleString(),
    };
    const last = state.feedback.history.at(-1);
    if (!last || last.rating !== next.rating || last.comment !== next.comment)
      state.feedback.history.push(next);
    state.feedback.comment = next.comment;
    save();
    say("Feedback updated; prior versions retained.");
    render();
    return;
  }
  const edit = e.target.closest("[data-edit-entry]");
  if (edit) {
    state.editingEntry = edit.dataset.editEntry;
    navigate("entry-editor");
    return;
  }
  const left = e.target.closest("[data-leftover]");
  if (left) {
    state.leftoverId = left.dataset.leftover;
    document.querySelector("#leftover-photo").click();
    return;
  }
  const period = e.target.closest("[data-period]");
  if (period) {
    state.reportPeriod = period.dataset.period;
    save();
    render();
    return;
  }
  const food = e.target.closest("[data-food]");
  if (food) {
    state.foodId = food.dataset.food;
    navigate("food-detail");
    return;
  }
  const profile = e.target.closest("[data-profile]");
  if (profile) {
    state.profileKind = profile.dataset.profile;
    navigate("profile-edit");
    return;
  }
  const rating = e.target.closest("[data-rating]");
  if (rating) {
    state.feedback.rating = Number(rating.dataset.rating);
    render();
    return;
  }
  const restaurantAdd = e.target.closest("[data-add-restaurant]");
  if (restaurantAdd) {
    state.entries.push({
      id: crypto.randomUUID(),
      date: todayDate,
      label: "Dinner",
      icon: "D",
      description: `${restaurantAdd.dataset.addRestaurant}: grilled salmon, double vegetables, sauce on side`,
      calories: 610,
      protein: 42,
      carbs: 22,
      netCarbs: 14,
      fat: 34,
      fiber: 8,
      water: 0,
      favorite: false,
      source: "restaurant estimate",
    });
    save();
    say("Restaurant choice added to Today’s Entries.");
    navigate("entries");
    return;
  }
  const recreateButton = e.target.closest("[data-recreate]");
  if (recreateButton) {
    document.querySelector("#recreate-result").innerHTML =
      `<article class="recipe"><h3>At-home grilled salmon plate</h3><p>Season salmon with lemon and pepper, grill, and serve with roasted broccoli and zucchini. Keep sauce on the side.</p><div class="recipe-actions"><button class="button primary" data-save-generated>🍎 Save as favorite</button><button class="button" data-copy-text="At-home salmon recipe copied">Copy recipe</button></div></article>`;
    return;
  }
  const generated = e.target.closest("[data-save-generated]");
  if (generated) {
    state.foods.push({
      id: crypto.randomUUID(),
      date: todayDate,
      name: "Generated protein & vegetable plate",
      detail: "Generated at-home recipe",
      calories: 520,
      protein: 42,
      favorite: true,
      recipe:
        "Protein with two non-starchy vegetables, lemon, herbs, and sauce on the side.",
    });
    save();
    say("Recipe saved as a favorite.");
    return;
  }
  const logFood = e.target.closest("[data-log-food]");
  if (logFood) {
    const f = state.foods.find((x) => x.id === logFood.dataset.logFood);
    state.entries.push({
      id: crypto.randomUUID(),
      label: "Dinner",
      icon: "D",
      description: f.name,
      calories: f.calories,
      protein: f.protein,
      carbs: 20,
      netCarbs: 12,
      fat: 28,
      fiber: 6,
      water: 0,
      favorite: true,
      source: "saved favorite",
    });
    save();
    say("Favorite added to Today’s Entries.");
    navigate("entries");
    return;
  }
  const toggle = e.target.closest("[data-toggle-favorite]");
  if (toggle) {
    const f = state.foods.find((x) => x.id === toggle.dataset.toggleFavorite);
    f.favorite = !f.favorite;
    save();
    say(f.favorite ? "Saved as favorite." : "Removed from favorites.");
    render();
    return;
  }
  const copy = e.target.closest("[data-copy-recipe],[data-copy-text]");
  if (copy) {
    const f =
      copy.dataset.copyRecipe &&
      state.foods.find((x) => x.id === copy.dataset.copyRecipe);
    await navigator.clipboard?.writeText(
      f?.recipe || copy.dataset.copyText || "Recipe",
    );
    say("Recipe copied.");
    return;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "entries-date") {
    state.entryDate = e.target.value;
    save();
    render();
    return;
  }
  if (e.target.id === "meal-photo" && e.target.files.length) {
    const input = document.querySelector("#log-description");
    input.value =
      "Photo ready—MealDaddy will generate the written meal description";
    input.dataset.photo = "true";
    document.querySelector("#log-status").textContent =
      `${e.target.files[0].name} selected.`;
  }
  if (e.target.id === "leftover-photo" && e.target.files.length) {
    const x = state.entries.find((v) => v.id === state.leftoverId);
    x.calories = Math.round(x.calories * 0.75);
    x.source = "adjusted after leftover photo";
    save();
    say("Original meal adjusted; no second entry created.");
    render();
  }
});
render();
