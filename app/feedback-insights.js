import { requireSession, supabase } from "./supabase-client.js";

const $ = (selector) => document.querySelector(selector);
const session = await requireSession();

if (!session) {
  throw new Error("Authentication required.");
}

document.body.classList.remove("auth-loading");
$("#account-email").textContent = session.user.email || "Signed in";

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

async function functionPayloadError(error, fallback) {
  try {
    const response = error?.context;
    if (response && typeof response.clone === "function") {
      const payload = await response.clone().json();
      if (payload?.error) return payload.error;
    }
  } catch {
    // Use the safe fallback below.
  }
  return error?.message || fallback;
}

function familyAccessDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function renderFamilyAccess(grants) {
  const container = $("#family-access-list");
  container.replaceChildren();
  const activeCount = grants.filter((grant) => grant.status === "active").length;
  setText("#family-access-count", `${activeCount} active`);
  if (!grants.length) {
    const empty = document.createElement("p");
    empty.className = "family-access-empty";
    empty.textContent = "No complimentary family accounts have been granted yet.";
    container.append(empty);
    return;
  }
  for (const grant of grants) {
    const row = document.createElement("article");
    const details = document.createElement("div");
    const email = document.createElement("strong");
    const meta = document.createElement("span");
    const status = document.createElement("span");
    const button = document.createElement("button");
    email.textContent = grant.email || "Account unavailable";
    meta.textContent = grant.status === "active"
      ? `Granted ${familyAccessDate(grant.granted_at)}`
      : `Revoked ${familyAccessDate(grant.revoked_at)}`;
    status.textContent = grant.status === "active" ? "Complimentary" : "Revoked";
    status.className = `family-access-pill ${grant.status === "active" ? "" : "is-revoked"}`;
    button.type = "button";
    button.className = grant.status === "active" ? "button button-danger-outline" : "button button-quiet";
    button.textContent = grant.status === "active" ? "Revoke" : "Grant again";
    button.addEventListener("click", () => updateFamilyAccess(
      grant.status === "active" ? "revoke" : "grant",
      grant.email,
      grant.user_id,
      button
    ));
    details.append(email, meta);
    row.append(details, status, button);
    container.append(row);
  }
}

async function familyAccessRequest(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("manage-family-access", {
    body: { action, ...payload }
  });
  if (error || !data?.ok) {
    throw new Error(await functionPayloadError(error, data?.error || "Family access could not be updated."));
  }
  return data;
}

async function loadFamilyAccess() {
  const result = await familyAccessRequest("list");
  $("#family-access-section").hidden = false;
  renderFamilyAccess(Array.isArray(result.grants) ? result.grants : []);
}

async function updateFamilyAccess(action, email, userId, button) {
  button.disabled = true;
  setText(
    "#family-access-status",
    action === "grant" ? `Granting complimentary access to ${email}...` : `Revoking complimentary access for ${email}...`
  );
  try {
    await familyAccessRequest(action, { email, userId });
    setText(
      "#family-access-status",
      action === "grant" ? `Complimentary Family Access granted to ${email}.` : `Complimentary Family Access revoked for ${email}.`
    );
    await loadFamilyAccess();
  } catch (error) {
    setText("#family-access-status", error.message || "Family access could not be updated.");
    button.disabled = false;
  }
}

function formatAverage(value) {
  return Number(value) > 0 ? `${Number(value).toFixed(2)} / 5` : "—";
}

function formatDate(value) {
  if (!value) return "";
  return `Generated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value))}`;
}

function createFinding(item, type) {
  const article = document.createElement("article");
  const heading = document.createElement("div");
  const title = document.createElement("strong");
  const count = document.createElement("span");
  const detail = document.createElement("p");

  title.textContent = item.topic || item.feature || item.indicator || item.action || "Finding";
  const tags = [];
  if (Number.isFinite(item.evidence_count)) {
    tags.push(`${item.evidence_count} ${item.evidence_count === 1 ? "report" : "reports"}`);
  }
  if (item.severity) tags.push(`${item.severity} concern`);
  if (item.direction) tags.push(item.direction);
  if (item.priority) tags.push(item.priority);
  count.textContent = tags.join(" · ");
  detail.textContent = item.detail || item.reason || "";
  heading.append(title, count);
  article.append(heading, detail);
  article.classList.add(`finding-${type}`);
  return article;
}

function renderFindingList(selector, items, type) {
  const container = $(selector);
  container.replaceChildren();
  if (!Array.isArray(items) || !items.length) {
    const empty = document.createElement("p");
    empty.className = "finding-empty";
    empty.textContent = "No clear signal in the feedback analyzed.";
    container.append(empty);
    return;
  }
  for (const item of items) container.append(createFinding(item, type));
}

function renderDistribution(distribution, customerCount) {
  const container = $("#rating-distribution");
  container.replaceChildren();
  for (let rating = 5; rating >= 1; rating -= 1) {
    const count = Number(distribution?.[String(rating)] || 0);
    const percent = customerCount ? Math.round((count / customerCount) * 100) : 0;
    const row = document.createElement("div");
    const label = document.createElement("span");
    const track = document.createElement("div");
    const fill = document.createElement("i");
    const value = document.createElement("strong");
    label.textContent = `${rating} star${rating === 1 ? "" : "s"}`;
    fill.style.width = `${percent}%`;
    track.append(fill);
    value.textContent = `${count} (${percent}%)`;
    row.append(label, track, value);
    container.append(row);
  }
}

function renderIndicators(indicators) {
  const customerCount = Number(indicators.unique_customers || 0);
  setText("#metric-submissions", String(indicators.total_submissions || 0));
  setText("#metric-customers", String(customerCount));
  setText("#metric-current-average", formatAverage(indicators.current_average_rating));
  setText("#metric-all-average", formatAverage(indicators.all_time_average_rating));
  setText("#metric-comments", String(indicators.commented_submissions || 0));
  setText("#metric-consent", String(indicators.current_public_display_consents || 0));
  setText("#metric-improved", String(indicators.customers_improved || 0));
  setText("#metric-declined", String(indicators.customers_declined || 0));
  setText("#metric-unchanged", String(indicators.customers_unchanged || 0));
  const historyCustomers = Number(indicators.customers_with_multiple_submissions || 0);
  setText(
    "#history-customer-count",
    `${historyCustomers} returning ${historyCustomers === 1 ? "customer" : "customers"}`
  );
  renderDistribution(indicators.current_rating_distribution, customerCount);
}

function renderAnalysis(result) {
  const analysis = result.analysis;
  $("#summary-stale").hidden = !result.stale;
  setText("#summary-time", formatDate(result.generated_at));
  setText(
    "#summary-signal",
    analysis?.overall_signal
      ? analysis.overall_signal.replaceAll("_", " ")
      : "Not generated"
  );

  if (!analysis) {
    $("#summary-empty").hidden = false;
    $("#summary-content").hidden = true;
    setText("#coverage-note", "Generate a summary when you want an AI-assisted review. This is not run automatically.");
    return;
  }

  $("#summary-empty").hidden = true;
  $("#summary-content").hidden = false;
  setText("#summary-overview", analysis.overview || "");
  renderFindingList("#summary-strengths", analysis.strengths, "strength");
  renderFindingList("#summary-concerns", analysis.concerns, "concern");
  renderFindingList("#summary-features", analysis.feature_requests, "feature");
  renderFindingList("#summary-trends", analysis.trend_signals, "trend");
  renderFindingList("#summary-actions", analysis.recommended_actions, "action");

  const coverage = result.analysis_coverage || {};
  const analyzed = Number(coverage.ai_analyzed_submissions ?? coverage.submissions_analyzed ?? 0);
  const total = Number(coverage.total_submissions ?? 0);
  const warning = coverage.ai_input_truncated || coverage.history_truncated
    ? ` The summary input was limited to ${analyzed.toLocaleString()} of ${total.toLocaleString()} submissions; exact totals remain visible above.`
    : "";
  setText(
    "#coverage-note",
    `This summary analyzed ${analyzed.toLocaleString()} feedback ${analyzed === 1 ? "submission" : "submissions"}.${warning}`
  );
}

async function functionErrorMessage(error, data) {
  if (data?.error) return data.error;
  try {
    const response = error?.context;
    if (response && typeof response.clone === "function") {
      const payload = await response.clone().json();
      if (payload?.error) return payload.error;
      if (payload?.message) return payload.message;
    }
  } catch {
    // Fall through to the safely worded client message below.
  }
  return error?.message || "Feedback insights could not be loaded.";
}

async function loadInsights(action = "latest") {
  const button = $("#generate-summary");
  button.disabled = true;
  setText(
    "#insights-status",
    action === "generate"
      ? "Analyzing de-identified feedback. This can take a few moments..."
      : "Loading protected feedback indicators..."
  );

  const { data, error } = await supabase.functions.invoke("summarize-feedback", {
    body: { action }
  });

  button.disabled = false;
  if (error || !data?.ok) {
    const message = await functionErrorMessage(error, data);
    setText("#insights-status", message);
    $("#insights-content").hidden = true;
    return;
  }

  renderIndicators(data.indicators || {});
  renderAnalysis(data);
  $("#insights-content").hidden = false;
  setText(
    "#insights-status",
    action === "generate"
      ? "Fresh feedback summary generated and saved."
      : "Protected feedback indicators loaded."
  );
}

$("#generate-summary").addEventListener("click", () => {
  loadInsights("generate").catch(() => {
    setText("#insights-status", "The summary could not be generated. Please try again.");
    $("#generate-summary").disabled = false;
  });
});

$("#family-access-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#family-access-email").value.trim().toLowerCase();
  const button = $("#grant-family-access");
  if (!email) return;
  await updateFamilyAccess("grant", email, "", button);
  if (!button.disabled) return;
  $("#family-access-email").value = "";
  button.disabled = false;
});

$("#sign-out").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.replace("./auth.html");
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") location.replace("./auth.html");
});

loadInsights().catch(() => {
  setText("#insights-status", "Feedback insights could not be loaded.");
  $("#generate-summary").disabled = false;
});

loadFamilyAccess().catch(async (error) => {
  setText("#family-access-status", await functionPayloadError(error, "Family access management could not be loaded."));
});
