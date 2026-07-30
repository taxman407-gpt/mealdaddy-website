import { supabase, requireSession } from "./supabase-client.js";

const $ = (selector) => document.querySelector(selector);
const session = await requireSession();
if (!session) throw new Error("Authentication required");

const user = session.user;
let membership = null;
document.body.classList.remove("auth-loading");
$("#account-email").textContent = user.email || "Signed in";
$("#member-since").textContent = formatDate(user.created_at);

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function titleCase(value = "") {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function downloadBlob(contents, type, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportDate() {
  return new Date().toISOString().slice(0, 10);
}

async function functionErrorMessage(error, fallback) {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const payload = await error.context.json();
      if (payload?.error) return payload.error;
    }
  } catch {
    // Fall through to a safe client message.
  }
  return error?.message || fallback;
}

async function fetchAllRows(table, columns = "*", orderColumn = null) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0;; offset += pageSize) {
    let query = supabase
      .from(table)
      .select(columns)
      .eq("user_id", user.id);
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function loadMembership() {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_key,status,trial_ends_at,current_period_ends_at,cancel_at_period_end,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  membership = data;

  if (!data) {
    $("#membership-title").textContent = "No paid membership";
    $("#membership-copy").textContent = "There is no Stripe subscription connected to this account.";
    $("#membership-status").textContent = "No plan";
    $("#membership-date-row").hidden = true;
    $("#billing-actions").hidden = true;
    return;
  }

  const current = ["trialing", "active", "past_due", "unpaid"].includes(data.status);
  const planName = data.plan_key === "byo" ? "Bring Your Own API" : "Meal Daddy Core";
  $("#membership-title").textContent = planName;
  $("#membership-status").textContent = data.cancel_at_period_end
    ? "Cancellation scheduled"
    : titleCase(data.status);
  $("#membership-status").classList.toggle("is-warning", data.status === "past_due" || data.status === "unpaid");
  $("#membership-status").classList.toggle("is-muted", !current);

  if (data.status === "trialing") {
    $("#membership-copy").textContent = "Your 7-day trial is active. You can cancel in Stripe without contacting support.";
    $("#membership-date-label").textContent = data.cancel_at_period_end ? "Access through" : "Trial ends";
    $("#membership-date").textContent = formatDate(data.trial_ends_at);
  } else {
    $("#membership-copy").textContent = data.cancel_at_period_end
      ? "Your membership will not renew. Access remains available through the date shown."
      : current
        ? "Your membership is active."
        : "This membership is no longer active.";
    $("#membership-date-label").textContent = data.cancel_at_period_end ? "Access through" : "Current period ends";
    $("#membership-date").textContent = formatDate(data.current_period_ends_at);
  }

  $("#billing-actions").hidden = !current;
  $("#cancel-membership").disabled = Boolean(data.cancel_at_period_end);
  if (data.cancel_at_period_end) $("#cancel-membership").textContent = "Cancellation scheduled";
}

async function openBillingPortal(action) {
  const manageButton = $("#manage-billing");
  const cancelButton = $("#cancel-membership");
  const status = $("#billing-message");
  manageButton.disabled = true;
  cancelButton.disabled = true;
  status.textContent = action === "cancel"
    ? "Opening Stripe’s secure cancellation page..."
    : "Opening Stripe’s secure billing portal...";

  try {
    const { data, error } = await supabase.functions.invoke("create-billing-portal", {
      body: { action }
    });
    if (error) throw error;
    const url = new URL(data?.url || "");
    if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com") {
      throw new Error("Stripe did not return a valid billing address.");
    }
    location.assign(url.href);
  } catch (error) {
    status.textContent = await functionErrorMessage(
      error,
      "Secure billing management could not be opened. Please try again."
    );
    manageButton.disabled = false;
    cancelButton.disabled = Boolean(membership?.cancel_at_period_end);
  }
}

async function accountExport() {
  const [profileResult, ledger, feedback, feedbackHistory] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    fetchAllRows("ledger_entries", "*", "occurred_at"),
    fetchAllRows("customer_feedback", "*", "updated_at"),
    fetchAllRows("customer_feedback_history", "*", "source_updated_at")
  ]);
  if (profileResult.error) throw profileResult.error;

  return {
    export_format: "Meal Daddy account export v1",
    generated_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      email_confirmed_at: user.email_confirmed_at,
      user_metadata: user.user_metadata
    },
    profile: profileResult.data,
    membership: membership ? {
      plan_key: membership.plan_key,
      status: membership.status,
      trial_ends_at: membership.trial_ends_at,
      current_period_ends_at: membership.current_period_ends_at,
      cancel_at_period_end: membership.cancel_at_period_end,
      updated_at: membership.updated_at
    } : null,
    ledger_entries: ledger,
    feedback: {
      current: feedback,
      history: feedbackHistory
    },
    notes: [
      "Payment methods and invoices are held by Stripe and are not included in this file.",
      "Nutrition values are estimates, not laboratory measurements or medical advice."
    ]
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function ledgerCsv(entries) {
  const headers = [
    "occurred_at",
    "kind",
    "meal_label",
    "description",
    "status",
    "calories_estimate",
    "protein_g_estimate",
    "total_carbs_g_estimate",
    "net_carbs_g_estimate",
    "fat_g_estimate",
    "fiber_g_estimate",
    "hydration_ounces_estimate",
    "estimate_confidence",
    "estimate_note"
  ];
  const rows = entries.map((entry) => {
    const nutrition = entry.nutrition_estimate || {};
    return [
      entry.occurred_at,
      entry.kind,
      entry.meal_label,
      entry.description,
      entry.status,
      nutrition.calories,
      nutrition.protein_g,
      nutrition.carbs_g,
      nutrition.net_carbs_g,
      nutrition.fat_g,
      nutrition.fiber_g,
      entry.kind === "hydration" ? nutrition.ounces : nutrition.hydration_ounces,
      nutrition.confidence,
      nutrition.note
    ].map(csvCell).join(",");
  });
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.join("\r\n")}`;
}

$("#manage-billing").addEventListener("click", () => openBillingPortal("manage"));
$("#cancel-membership").addEventListener("click", () => openBillingPortal("cancel"));

$("#download-json").addEventListener("click", async () => {
  const button = $("#download-json");
  const status = $("#export-message");
  button.disabled = true;
  status.textContent = "Gathering your protected records...";
  try {
    const data = await accountExport();
    downloadBlob(
      `${JSON.stringify(data, null, 2)}\n`,
      "application/json;charset=utf-8",
      `mealdaddy-account-${exportDate()}.json`
    );
    status.textContent = "Your complete account copy was downloaded to this device.";
  } catch (error) {
    status.textContent = error.message || "Your export could not be created. Please try again.";
  } finally {
    button.disabled = false;
  }
});

$("#download-csv").addEventListener("click", async () => {
  const button = $("#download-csv");
  const status = $("#export-message");
  button.disabled = true;
  status.textContent = "Gathering your complete meal history...";
  try {
    const entries = await fetchAllRows("ledger_entries", "*", "occurred_at");
    downloadBlob(
      ledgerCsv(entries),
      "text/csv;charset=utf-8",
      `mealdaddy-meal-history-${exportDate()}.csv`
    );
    status.textContent = `Downloaded ${entries.length.toLocaleString()} ledger ${entries.length === 1 ? "entry" : "entries"} to this device.`;
  } catch (error) {
    status.textContent = error.message || "Your meal history could not be downloaded. Please try again.";
  } finally {
    button.disabled = false;
  }
});

function updateDeleteButton() {
  $("#delete-account").disabled = !(
    $("#delete-understood").checked &&
    $("#delete-confirmation").value.trim() === "DELETE MY ACCOUNT"
  );
}

$("#delete-understood").addEventListener("change", updateDeleteButton);
$("#delete-confirmation").addEventListener("input", updateDeleteButton);
$("#delete-account").addEventListener("click", async () => {
  const button = $("#delete-account");
  const status = $("#delete-message");
  button.disabled = true;
  button.textContent = "Canceling billing and deleting data...";
  status.textContent = "Please keep this page open. Meal Daddy is first verifying that billing cannot continue.";

  try {
    const { data, error } = await supabase.functions.invoke("delete-account", {
      body: { confirmation: $("#delete-confirmation").value.trim() }
    });
    if (error) throw error;
    if (!data?.ok) throw new Error("Account deletion was not confirmed.");
    await supabase.auth.signOut({ scope: "local" });
    location.replace("./auth.html?account=deleted");
  } catch (error) {
    status.textContent = await functionErrorMessage(
      error,
      "Your account was not deleted. Please try again."
    );
    button.textContent = "Permanently delete my account";
    updateDeleteButton();
  }
});

$("#sign-out").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.replace("./auth.html");
});

if (new URLSearchParams(location.search).get("billing") === "returned") {
  $("#billing-message").textContent = "Billing update received. Refreshing membership status...";
}

try {
  await loadMembership();
  if (new URLSearchParams(location.search).get("billing") === "returned") {
    $("#billing-message").textContent = membership?.cancel_at_period_end
      ? "Cancellation is scheduled. Your access end date is shown above."
      : "Your billing details are up to date.";
  }
} catch (error) {
  $("#membership-title").textContent = "Membership unavailable";
  $("#membership-copy").textContent = "Billing details could not be loaded.";
  $("#membership-status").textContent = "Try again";
  $("#billing-actions").hidden = true;
  $("#billing-message").textContent = error.message || "Please refresh this page.";
}
