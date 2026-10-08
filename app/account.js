import { invokeAuthenticated, supabase, requireSession } from "./supabase-client.js?v=20261004-1";
import { clearLocalSavedFoods, getDeviceSavedFoods } from "./saved-foods-store.js?v=20260929-1";
import { metricLabel, normalizeMetricOrder, normalizeOptionalMetrics } from "./metric-order.js?v=20261004-3";

import { createOwnerToolsController } from "./account-owner-tools.js?v=20261008-1";

const $ = (selector) => document.querySelector(selector);
const session = await requireSession();
if (!session) throw new Error("Authentication required");

const user = session.user;
let membership = null;
let contactOptedIn = true;
let mfaEnrollment = null;
let mfaVerifiedFactors = [];
let mfaCurrentLevel = null;
let pendingMfaEnrollmentAfterChallenge = false;
let mfaPhoneChallengeId = "";
const ownerTools = createOwnerToolsController({ supabase, invokeAuthenticated, userId: user.id });

function safeAppReturn(value) {
  if (!value) return "./app.html?view=more";
  try {
    const target = new URL(value, location.href);
    if (target.origin !== location.origin || !target.pathname.endsWith("/app/app.html")) return "./app.html?view=more";
    const view = target.searchParams.get("view");
    return `./app.html?view=${new Set(["today", "log", "entries", "plan", "more"]).has(view) ? view : "more"}`;
  } catch {
    return "./app.html?view=more";
  }
}

const accountReturnTarget = safeAppReturn(new URLSearchParams(location.search).get("returnTo"));
document.querySelectorAll('a[href="./app.html"]').forEach((link) => { link.href = accountReturnTarget; });
$("#edit-setup-link").href = `./setup.html?returnTo=${encodeURIComponent(`./account.html?returnTo=${encodeURIComponent(accountReturnTarget)}`)}`;
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

function cleanMfaCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function setMfaMessage(message) {
  $("#mfa-message").textContent = message;
}

function focusSecurityHeading() {
  $("#security-title").focus({ preventScroll: true });
}

function selectedAccountMfaFactor() {
  return mfaVerifiedFactors.find((candidate) => candidate.id === $("#mfa-challenge-factor").value) || mfaVerifiedFactors[0] || null;
}

async function prepareAccountMfaChallenge() {
  const factor = selectedAccountMfaFactor();
  mfaPhoneChallengeId = "";
  const phoneFactor = factor?.factor_type === "phone";
  $("#mfa-resend-phone-code").hidden = !phoneFactor;
  if (!factor) throw new Error("No verified two-step factor is available.");
  if (!phoneFactor) {
    setMfaMessage("Enter the current code from your authenticator app.");
    return;
  }
  setMfaMessage("Sending a text-message security code…");
  const { data, error } = await supabase.auth.mfa.challenge({ factorId: factor.id, channel: "sms" });
  if (error || !data?.id) throw error || new Error("A text-message security code could not be sent.");
  mfaPhoneChallengeId = data.id;
  setMfaMessage("A security code was sent to the selected phone.");
}

function enrollmentQrSource(qrCode) {
  const value = String(qrCode || "");
  if (value.startsWith("data:image/")) return value;
  return value ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}` : "";
}

async function loadMfaSecurity() {
  const [factorResult, levelResult] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  if (factorResult.error) throw factorResult.error;
  if (levelResult.error) throw levelResult.error;
  mfaVerifiedFactors = (factorResult.data.all || []).filter((factor) =>
    factor.status === "verified" && ["totp", "phone"].includes(factor.factor_type)
  );
  mfaCurrentLevel = levelResult.data.currentLevel;
  const hasMfa = mfaVerifiedFactors.length > 0;
  const verifiedNow = mfaCurrentLevel === "aal2";
  $("#mfa-status-pill").textContent = hasMfa ? (verifiedNow ? "Protected · verified" : "Protected") : "Not enabled";
  $("#mfa-status-pill").classList.toggle("is-warning", hasMfa && !verifiedNow);
  $("#mfa-status-pill").classList.toggle("is-muted", !hasMfa);
  $("#mfa-summary").hidden = false;
  $("#mfa-summary-copy").textContent = !hasMfa
    ? "No authenticator app is connected yet. Add one to protect sensitive actions even if your password is compromised."
    : verifiedNow
      ? `This session has completed two-step verification${mfaVerifiedFactors.length > 1 ? ` with ${mfaVerifiedFactors.length} enrolled authenticators` : ""}.`
      : "Your authenticator is enrolled. Verify this session before opening Owner tools or performing protected account actions.";
  $("#mfa-enroll").hidden = mfaVerifiedFactors.length >= 2;
  $("#mfa-enroll").textContent = hasMfa ? "Add backup authenticator" : "Add authenticator app";
  $("#mfa-enroll").disabled = Boolean(mfaEnrollment);
  $("#mfa-step-up").hidden = !hasMfa || verifiedNow;
  $("#mfa-remove").hidden = !hasMfa || !verifiedNow;
  const factorOptions = () => mfaVerifiedFactors.map((factor, index) => {
    const option = document.createElement("option");
    option.value = factor.id;
    option.textContent = factor.friendly_name || factor.phone || `${factor.factor_type === "phone" ? "Phone" : "Authenticator"} ${index + 1}`;
    return option;
  });
  $("#mfa-challenge-factor").replaceChildren(...factorOptions());
  $("#mfa-manage-factor").replaceChildren(...factorOptions());
  $("#mfa-challenge-factor-label").hidden = mfaVerifiedFactors.length < 2;
  $("#mfa-manage-factor-label").hidden = !verifiedNow || mfaVerifiedFactors.length < 2;
  updateDeleteButton();
}

async function removeUnverifiedMfaFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  for (const factor of data.all || []) {
    if (factor.factor_type === "totp" && factor.status !== "verified") {
      const result = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (result.error) throw result.error;
    }
  }
}

async function beginMfaEnrollment() {
  const button = $("#mfa-enroll");
  setMfaMessage("Creating a private authenticator setup…");
  try {
    await removeUnverifiedMfaFactors();
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "MealDaddy",
      friendlyName: "MealDaddy Authenticator"
    });
    if (error) throw error;
    mfaEnrollment = data;
    $("#mfa-qr").src = enrollmentQrSource(data.totp.qr_code);
    $("#mfa-secret").textContent = data.totp.secret;
    $("#mfa-enrollment").hidden = false;
    $("#mfa-enrollment-code").focus();
    setMfaMessage("Scan the QR code, then enter the current six-digit code to finish.");
  } catch (error) {
    setMfaMessage(error.message || "Authenticator setup could not begin.");
    button.disabled = false;
  }
}

$("#mfa-enroll").addEventListener("click", () => {
  const button = $("#mfa-enroll");
  button.disabled = true;
  $("#mfa-reauth-form").hidden = false;
  $("#mfa-reauth-password").focus();
  setMfaMessage("Re-enter your current password before changing authenticator settings.");
});

$("#mfa-reauth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  setMfaMessage("Verifying your password…");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: $("#mfa-reauth-password").value
  });
  submitButton.disabled = false;
  if (error || data.user?.id !== user.id) {
    setMfaMessage("Your current password could not be verified.");
    $("#mfa-reauth-password").select();
    return;
  }
  $("#mfa-reauth-form").reset();
  $("#mfa-reauth-form").hidden = true;
  mfaCurrentLevel = "aal1";
  showOwnerToolsIfAuthorized().catch(() => {});
  $("#mfa-remove").hidden = true;
  $("#mfa-step-up").hidden = !mfaVerifiedFactors.length;
  updateDeleteButton();
  if (mfaVerifiedFactors.length) {
    pendingMfaEnrollmentAfterChallenge = true;
    $("#mfa-challenge-form").hidden = false;
    try {
      await prepareAccountMfaChallenge();
    } catch (error) {
      setMfaMessage(error.message || "That two-step factor is unavailable.");
    }
    $("#mfa-challenge-code").focus();
    return;
  }
  await beginMfaEnrollment();
});

$("#mfa-cancel-reauth").addEventListener("click", () => {
  $("#mfa-reauth-form").reset();
  $("#mfa-reauth-form").hidden = true;
  $("#mfa-enroll").disabled = false;
  setMfaMessage("Authenticator settings were not changed.");
  $("#mfa-enroll").focus();
});

$("#mfa-copy-secret").addEventListener("click", async () => {
  const secret = $("#mfa-secret").textContent;
  if (!secret) return;
  try {
    await navigator.clipboard.writeText(secret);
    setMfaMessage("The setup key was copied. Keep it private.");
  } catch {
    setMfaMessage("Press and hold the setup key to copy it.");
  }
});

$("#mfa-enrollment-code").addEventListener("input", (event) => {
  event.target.value = cleanMfaCode(event.target.value);
});

$("#mfa-enrollment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = cleanMfaCode($("#mfa-enrollment-code").value);
  if (!mfaEnrollment?.id || code.length !== 6) {
    setMfaMessage("Enter the six-digit code shown by your authenticator app.");
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  setMfaMessage("Verifying your authenticator…");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaEnrollment.id, code });
  button.disabled = false;
  if (error) {
    setMfaMessage(error.message || "That code could not be verified.");
    return;
  }
  mfaEnrollment = null;
  $("#mfa-enrollment-form").reset();
  $("#mfa-enrollment").hidden = true;
  $("#mfa-qr").removeAttribute("src");
  $("#mfa-secret").textContent = "";
  setMfaMessage("Authenticator protection is active.");
  await loadMfaSecurity();
  await showOwnerToolsIfAuthorized().catch(() => {});
  focusSecurityHeading();
});

$("#mfa-cancel-enrollment").addEventListener("click", async () => {
  const enrollment = mfaEnrollment;
  mfaEnrollment = null;
  $("#mfa-enrollment").hidden = true;
  $("#mfa-enrollment-form").reset();
  $("#mfa-qr").removeAttribute("src");
  $("#mfa-secret").textContent = "";
  if (enrollment?.id) await supabase.auth.mfa.unenroll({ factorId: enrollment.id }).catch(() => {});
  $("#mfa-enroll").disabled = false;
  setMfaMessage("Authenticator setup was canceled.");
  $("#mfa-enroll").focus();
});

$("#mfa-step-up").addEventListener("click", async () => {
  $("#mfa-challenge-form").hidden = false;
  try {
    await prepareAccountMfaChallenge();
  } catch (error) {
    setMfaMessage(error.message || "That two-step factor is unavailable.");
  }
  $("#mfa-challenge-code").focus();
});

$("#mfa-challenge-factor").addEventListener("change", async () => {
  $("#mfa-challenge-code").value = "";
  try {
    await prepareAccountMfaChallenge();
    $("#mfa-challenge-code").focus();
  } catch (error) {
    setMfaMessage(error.message || "That two-step factor is unavailable.");
  }
});

$("#mfa-resend-phone-code").addEventListener("click", async () => {
  try {
    await prepareAccountMfaChallenge();
    $("#mfa-challenge-code").focus();
  } catch (error) {
    setMfaMessage(error.message || "A new text-message code could not be sent.");
  }
});

$("#mfa-challenge-code").addEventListener("input", (event) => {
  event.target.value = cleanMfaCode(event.target.value);
});

$("#mfa-challenge-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const factor = selectedAccountMfaFactor();
  const code = cleanMfaCode($("#mfa-challenge-code").value);
  if (!factor || code.length !== 6) {
    setMfaMessage("Enter the six-digit code shown by your authenticator app.");
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  setMfaMessage("Verifying this session…");
  const result = factor.factor_type === "phone"
    ? mfaPhoneChallengeId
      ? await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: mfaPhoneChallengeId, code })
      : { error: new Error("Send a text-message code before verifying.") }
    : await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  const { error } = result;
  button.disabled = false;
  if (error) {
    setMfaMessage(error.message || "That code could not be verified.");
    return;
  }
  $("#mfa-challenge-form").reset();
  $("#mfa-challenge-form").hidden = true;
  mfaPhoneChallengeId = "";
  if (pendingMfaEnrollmentAfterChallenge) {
    pendingMfaEnrollmentAfterChallenge = false;
    await beginMfaEnrollment();
    return;
  }
  setMfaMessage("This session now has two-step verification.");
  await loadMfaSecurity();
  await showOwnerToolsIfAuthorized().catch(() => {});
  focusSecurityHeading();
});

$("#mfa-cancel-challenge").addEventListener("click", () => {
  $("#mfa-challenge-form").reset();
  $("#mfa-challenge-form").hidden = true;
  mfaPhoneChallengeId = "";
  if (pendingMfaEnrollmentAfterChallenge) {
    pendingMfaEnrollmentAfterChallenge = false;
    $("#mfa-enroll").disabled = false;
    location.reload();
    return;
  } else {
    $("#mfa-step-up").focus();
  }
  setMfaMessage("");
});

$("#mfa-remove").addEventListener("click", async () => {
  const factor = mfaVerifiedFactors.find((candidate) => candidate.id === $("#mfa-manage-factor").value) || mfaVerifiedFactors[0];
  if (!factor) return;
  const factorName = factor.friendly_name || "this authenticator";
  if (!window.confirm(`Remove ${factorName} from your MealDaddy account?`)) return;
  const button = $("#mfa-remove");
  button.disabled = true;
  setMfaMessage("Removing the authenticator…");
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  button.disabled = false;
  if (error) {
    setMfaMessage(error.message || "The authenticator could not be removed.");
    return;
  }
  showOwnerToolsIfAuthorized().catch(() => {});
  const refreshResult = await supabase.auth.refreshSession();
  if (refreshResult.error) {
    setMfaMessage("The authenticator was removed. Sign in again to refresh this session securely.");
    await supabase.auth.signOut({ scope: "local" });
    location.replace("./auth.html");
    return;
  }
  setMfaMessage("The authenticator was removed.");
  await loadMfaSecurity();
  focusSecurityHeading();
});

function titleCase(value = "") {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function listText(value, fallback = "None selected") {
  return Array.isArray(value) && value.length ? value.join(", ") : fallback;
}

async function loadProfileSummary() {
  const { data, error } = await supabase
    .from("profiles")
    .select("diet_style,coaching_tone,onboarding_data")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  const profile = data?.onboarding_data || {};
  const primaryStyle = profile.primary_eating_style || data?.diet_style || "Flexible";
  const otherStyles = (Array.isArray(profile.eating_styles) ? profile.eating_styles : [])
    .filter((style) => String(style).toLowerCase() !== String(primaryStyle).toLowerCase());
  const goals = Array.isArray(profile.primary_goals)
    ? profile.primary_goals
    : profile.primary_goal ? [profile.primary_goal] : [];
  const targets = [
    profile.calorie_goal ? `${profile.calorie_goal} calories` : "",
    profile.protein_goal ? `${profile.protein_goal}g protein` : "",
    profile.net_carb_goal ? `${profile.net_carb_goal}g net-carbohydrate ceiling` : "",
    profile.fiber_goal ? `${profile.fiber_goal}g fiber` : "",
    profile.water_goal ? `${profile.water_goal} oz hydration` : ""
  ].filter(Boolean);
  const favorites = [
    ...(Array.isArray(profile.favorite_proteins) ? profile.favorite_proteins : []),
    ...(Array.isArray(profile.favorite_cuisines) ? profile.favorite_cuisines : [])
  ];
  $("#profile-primary-style").textContent = primaryStyle;
  $("#profile-other-styles").textContent = listText(otherStyles);
  $("#profile-goals").textContent = listText(goals, "No goals selected");
  $("#profile-targets").textContent = listText(targets, "Using general starting targets");
  $("#profile-avoid").textContent = profile.foods_to_avoid || "None listed";
  $("#profile-favorites").textContent = listText(favorites);
  $("#profile-coaching").textContent = profile.coaching_style || titleCase(data?.coaching_tone || "supportive");
  $("#profile-reminders").textContent = listText(profile.reminders);
  $("#profile-metric-order").textContent = normalizeMetricOrder(profile.today_metric_order, profile).map(metricLabel).join(" → ");
  $("#profile-optional-metrics").textContent = listText(normalizeOptionalMetrics(profile.today_optional_metrics).map(metricLabel), "None selected");
}

async function loadContactPreference() {
  const { data, error } = await supabase
    .from("email_contact_preferences")
    .select("opted_in,consent_updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  contactOptedIn = data ? Boolean(data.opted_in) : true;
  $("#save-contact-preference").textContent = contactOptedIn
    ? "Unsubscribe from optional updates"
    : "Receive optional updates again";
  $("#contact-preference-message").textContent = data
    ? `${contactOptedIn ? "Optional updates are active." : "Optional updates are stopped."} Preference last updated ${formatDate(data.consent_updated_at)}.`
    : "Optional updates are active for your account email.";
}

$("#contact-preference-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#save-contact-preference");
  const message = $("#contact-preference-message");
  const optedIn = !contactOptedIn;
  button.disabled = true;
  message.textContent = "Saving your email preference...";
  const now = new Date().toISOString();
  const { error } = await supabase.from("email_contact_preferences").upsert({
    user_id: user.id,
    email: String(user.email || "").trim().toLowerCase(),
    opted_in: optedIn,
    consent_source: "account",
    consent_updated_at: now,
    updated_at: now
  }, { onConflict: "user_id" });
  button.disabled = false;
  if (!error) {
    contactOptedIn = optedIn;
    button.textContent = contactOptedIn
      ? "Unsubscribe from optional updates"
      : "Receive optional updates again";
  }
  message.textContent = error
    ? error.message
    : optedIn
      ? "You’re subscribed to occasional MealDaddy updates."
      : "You’re unsubscribed from optional MealDaddy updates.";
});

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
  const [subscriptionResult, grantResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_key,status,trial_ends_at,current_period_ends_at,cancel_at_period_end,updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("complimentary_access_grants")
      .select("access_type,status,granted_at,updated_at")
      .eq("user_id", user.id)
      .maybeSingle()
  ]);
  if (subscriptionResult.error) throw subscriptionResult.error;
  if (grantResult.error) throw grantResult.error;
  const data = subscriptionResult.data;
  const currentStripeMembership = data && ["trialing", "active", "past_due", "unpaid"].includes(data.status);
  const familyGrant = !currentStripeMembership &&
    grantResult.data?.access_type === "family" &&
    grantResult.data.status === "active"
    ? grantResult.data
    : null;
  if (familyGrant) {
    membership = {
      plan_key: "core",
      status: "active",
      access_source: "family",
      granted_at: familyGrant.granted_at,
      updated_at: familyGrant.updated_at
    };
    $("#membership-title").textContent = "Complimentary Family Access";
    $("#membership-copy").textContent = "Meal Daddy Core is available to this account without a monthly fee or payment method.";
    $("#membership-status").textContent = "Complimentary";
    $("#membership-status").classList.remove("is-warning", "is-muted");
    $("#membership-date-row").hidden = true;
    $("#billing-actions").hidden = true;
    $("#membership-explainer").textContent = "This access was granted directly by Meal Daddy and does not create a Stripe subscription. The Meal Daddy owner can manage this complimentary access.";
    return;
  }
  membership = data ? { ...data, access_source: "stripe" } : null;

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
    const { data, error } = await invokeAuthenticated("create-billing-portal", {
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
  const [profileResult, ledger, weights, savedFoods, deviceSavedFoods, savedRecipes, recipeFeedback, feedback, feedbackHistory, contactPreference] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    fetchAllRows("ledger_entries", "*", "occurred_at"),
    fetchAllRows("weight_entries", "*", "measured_on"),
    fetchAllRows("saved_foods", "*", "updated_at"),
    getDeviceSavedFoods(user.id).catch(() => []),
    fetchAllRows("saved_recipes", "*", "updated_at"),
    fetchAllRows("recipe_beta_feedback", "*", "created_at"),
    fetchAllRows("customer_feedback", "*", "updated_at"),
    fetchAllRows("customer_feedback_history", "*", "source_updated_at"),
    supabase.from("email_contact_preferences").select("email,opted_in,consent_source,consent_updated_at,created_at,updated_at").eq("user_id", user.id).maybeSingle()
  ]);
  if (profileResult.error) throw profileResult.error;
  if (contactPreference.error) throw contactPreference.error;

  return {
    export_format: "Meal Daddy account export v3",
    generated_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      email_confirmed_at: user.email_confirmed_at,
      user_metadata: user.user_metadata
    },
    profile: profileResult.data,
    email_contact_preference: contactPreference.data,
    membership: membership ? {
      plan_key: membership.plan_key,
      status: membership.status,
      trial_ends_at: membership.trial_ends_at,
      current_period_ends_at: membership.current_period_ends_at,
      cancel_at_period_end: membership.cancel_at_period_end,
      updated_at: membership.updated_at,
      access_source: membership.access_source,
      granted_at: membership.granted_at || null
    } : null,
    ledger_entries: ledger,
    weight_entries: weights,
    saved_foods: {
      private_account: savedFoods,
      this_device: deviceSavedFoods.map(({ photo_blob, cache_key, ...food }) => ({
        ...food,
        retained_photo_included: false,
        retained_photo_present: photo_blob instanceof Blob
      }))
    },
    saved_recipes: savedRecipes,
    recipe_beta_feedback: recipeFeedback,
    feedback: {
      current: feedback,
      history: feedbackHistory
    },
    notes: [
      "Payment methods and invoices are held by Stripe and are not included in this file.",
      "Device-only retained photos are not embedded in this JSON file; their presence is identified in the saved-food record.",
      "Nutrition values are estimates, not laboratory measurements or medical advice."
    ]
  };
}

async function showOwnerToolsIfAuthorized() {
  return ownerTools.refresh();
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const withoutControls = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const text = /^[=+\-@\t\r]/.test(withoutControls) ? `'${withoutControls}` : withoutControls;
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
    "inflammation_score_estimate_1_to_10",
    "inflammation_summary",
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
      nutrition.inflammation_score,
      nutrition.inflammation_summary,
      nutrition.confidence,
      nutrition.note
    ].map(csvCell).join(",");
  });
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.join("\r\n")}`;
}

function savedFoodsCsv(foods) {
  const headers = [
    "storage_location",
    "item_type",
    "name",
    "brand_or_restaurant",
    "serving_description",
    "calories",
    "protein_g",
    "total_carbs_g",
    "net_carbs_g",
    "fiber_g",
    "fat_g",
    "sugar_alcohols_g",
    "allulose_g",
    "hydration_ounces",
    "value_source",
    "confidence",
    "notes",
    "last_verified_on",
    "is_pinned",
    "use_count",
    "last_used_at"
  ];
  const rows = foods.map((food) => [
    food.storage_location,
    food.item_type,
    food.name,
    food.brand_or_restaurant,
    food.serving_description,
    food.calories,
    food.protein_g,
    food.carbs_g,
    food.net_carbs_g,
    food.fiber_g,
    food.fat_g,
    food.sugar_alcohols_g,
    food.allulose_g,
    food.hydration_ounces,
    food.evidence_type,
    food.confidence,
    food.notes,
    food.last_verified_on,
    food.is_pinned,
    food.use_count,
    food.last_used_at
  ].map(csvCell).join(","));
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

$("#download-saved-foods-csv").addEventListener("click", async () => {
  const button = $("#download-saved-foods-csv");
  const status = $("#export-message");
  button.disabled = true;
  status.textContent = "Gathering your private saved foods...";
  try {
    const [synced, device] = await Promise.all([
      fetchAllRows("saved_foods", "*", "updated_at"),
      getDeviceSavedFoods(user.id).catch(() => [])
    ]);
    const foods = [
      ...synced.map((food) => ({ ...food, storage_location: "private_account_and_device_cache" })),
      ...device.map((food) => ({ ...food, storage_location: "this_device_only" }))
    ];
    downloadBlob(
      savedFoodsCsv(foods),
      "text/csv;charset=utf-8",
      `mealdaddy-saved-foods-${exportDate()}.csv`
    );
    status.textContent = `Downloaded ${foods.length.toLocaleString()} saved ${foods.length === 1 ? "food" : "foods"} to this device.`;
  } catch (error) {
    status.textContent = error.message || "Your saved-food library could not be downloaded.";
  } finally {
    button.disabled = false;
  }
});

function updateDeleteButton() {
  $("#delete-account").disabled = !(
    $("#delete-understood").checked &&
    $("#delete-confirmation").value.trim() === "DELETE MY ACCOUNT" &&
    $("#delete-password").value.length >= 8
  );
}

$("#delete-understood").addEventListener("change", updateDeleteButton);
$("#delete-confirmation").addEventListener("input", updateDeleteButton);
$("#delete-password").addEventListener("input", updateDeleteButton);
$("#delete-account").addEventListener("click", async () => {
  const button = $("#delete-account");
  const status = $("#delete-message");
  if (mfaVerifiedFactors.length && mfaCurrentLevel !== "aal2") {
    status.textContent = "Verify this session with your authenticator before deleting your account.";
    $("#mfa-step-up").click();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("#security-title").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    return;
  }
  button.disabled = true;
  button.textContent = "Canceling billing and deleting data...";
  status.textContent = "Please keep this page open. Meal Daddy is first verifying that billing cannot continue.";

  try {
    const { data, error } = await invokeAuthenticated("delete-account", {
      body: {
        confirmation: $("#delete-confirmation").value.trim(),
        currentPassword: $("#delete-password").value
      }
    });
    if (error) throw error;
    if (!data?.ok) throw new Error("Account deletion was not confirmed.");
    await clearLocalSavedFoods(user.id).catch(() => {});
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

try {
  await loadProfileSummary();
} catch (error) {
  $("#profile-message").textContent = error.message || "Your profile could not be loaded. Please refresh this page.";
}

try {
  await loadContactPreference();
} catch (error) {
  $("#contact-preference-message").textContent = error.message || "Your email preference could not be loaded. Please refresh this page.";
}

try {
  await loadMfaSecurity();
} catch (error) {
  $("#mfa-status-pill").textContent = "Unavailable";
  $("#mfa-status-pill").classList.add("is-warning");
  setMfaMessage(error.message || "Authenticator settings could not be loaded.");
}

showOwnerToolsIfAuthorized().catch(() => {});
