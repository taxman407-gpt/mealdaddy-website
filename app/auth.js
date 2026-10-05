import { supabase } from "./supabase-client.js?v=20261004-1";

const form = document.querySelector("#auth-form");
const email = document.querySelector("#email");
const password = document.querySelector("#password");
const confirmPassword = document.querySelector("#confirm-password");
const confirmPasswordLabel = document.querySelector("#confirm-password-label");
const status = document.querySelector("#auth-status");
const submit = document.querySelector("#auth-submit");
const title = document.querySelector("#auth-title");
const copy = document.querySelector("#auth-copy");
const mfaForm = document.querySelector("#mfa-signin-form");
const mfaCode = document.querySelector("#mfa-signin-code");
const mfaSubmit = document.querySelector("#mfa-signin-submit");
const mfaFactor = document.querySelector("#mfa-signin-factor");
let mode = "signin";
let recoverySession = false;
let pendingMfaFactorId = "";
let pendingMfaFactors = [];
let pendingMfaChallengeId = "";

function cleanMfaCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

async function requiredMfaFactors() {
  const factorResult = await supabase.auth.mfa.listFactors();
  if (factorResult.error) throw factorResult.error;
  const factors = (factorResult.data.all || []).filter((factor) =>
    factor.status === "verified" && ["totp", "phone"].includes(factor.factor_type)
  );
  if (!factors.length) return null;
  const levelResult = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (levelResult.error) throw levelResult.error;
  if (levelResult.data.currentLevel === "aal2") return null;
  return factors;
}

function selectedMfaFactor() {
  return pendingMfaFactors.find((factor) => factor.id === mfaFactor.value) || pendingMfaFactors[0] || null;
}

async function prepareSelectedMfaFactor() {
  const factor = selectedMfaFactor();
  pendingMfaFactorId = factor?.id || "";
  pendingMfaChallengeId = "";
  const phoneFactor = factor?.factor_type === "phone";
  document.querySelector("#mfa-send-phone-code").hidden = !phoneFactor;
  if (!factor) throw new Error("No verified two-step factor is available.");
  if (!phoneFactor) {
    status.textContent = "Enter the current code from the selected authenticator app.";
    return;
  }
  status.textContent = "Sending a text-message security code…";
  const { data, error } = await supabase.auth.mfa.challenge({ factorId: factor.id, channel: "sms" });
  if (error || !data?.id) throw error || new Error("A text-message security code could not be sent.");
  pendingMfaChallengeId = data.id;
  status.textContent = "A security code was sent to the selected phone.";
}

async function showMfaForm(factors) {
  pendingMfaFactors = factors;
  mfaFactor.replaceChildren(...factors.map((factor, index) => {
    const option = document.createElement("option");
    option.value = factor.id;
    option.textContent = factor.friendly_name || factor.phone || `${factor.factor_type === "phone" ? "Phone" : "Authenticator"} ${index + 1}`;
    return option;
  }));
  document.querySelector("#mfa-signin-factor-label").hidden = factors.length < 2;
  document.querySelector(".auth-tabs").hidden = true;
  form.hidden = true;
  document.querySelector("#reset-password").hidden = true;
  mfaForm.hidden = false;
  title.textContent = "Enter your security code";
  copy.textContent = "Your password was accepted. Complete two-step verification to finish signing in.";
  await prepareSelectedMfaFactor();
  mfaCode.focus();
}

async function continueAfterAuthentication(destination) {
  const factors = await requiredMfaFactors();
  if (factors) {
    await showMfaForm(factors);
    return;
  }
  location.replace(destination);
}

function showRecoveryForm() {
  recoverySession = true;
  document.querySelector(".auth-tabs").hidden = true;
  email.closest("label").hidden = true;
  email.required = false;
  title.textContent = "Choose a new MealDaddy password";
  copy.textContent = "Enter and confirm a new password below. Use at least eight characters.";
  password.value = "";
  password.autocomplete = "new-password";
  confirmPasswordLabel.hidden = false;
  confirmPassword.required = true;
  submit.textContent = "Save new password";
  document.querySelector("#reset-password").hidden = true;
  status.textContent = "Your secure recovery link was accepted. Choose your new password.";
}

const returnTo = new URLSearchParams(location.search).get("returnTo") || "./app.html";
function safeSameOriginPath(value) {
  if (typeof value !== "string" || value.includes("\\")) return "./app.html";
  try {
    const destination = new URL(value, location.href);
    if (destination.origin !== location.origin) return "./app.html";
    if (!destination.pathname.startsWith("/app/")) return "./app.html";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "./app.html";
  }
}
const safeReturnTo = safeSameOriginPath(returnTo);
const signupTarget = new URL(safeReturnTo, location.href);
signupTarget.hash = "onboarding";
const accountWasDeleted = new URLSearchParams(location.search).get("account") === "deleted";

function setMode(nextMode) {
  mode = nextMode;
  const signingUp = mode === "signup";
  document.querySelector("#signin-tab").classList.toggle("is-active", !signingUp);
  document.querySelector("#signup-tab").classList.toggle("is-active", signingUp);
  title.textContent = signingUp ? "Create your account" : "Welcome back";
  copy.textContent = signingUp
    ? "Start with a quick food-style setup, then adjust anytime."
    : "Sign in to open your daily ledger, profile, and plans.";
  submit.textContent = signingUp ? "Create account" : "Sign in";
  password.autocomplete = signingUp ? "new-password" : "current-password";
  status.textContent = "";
}

document.querySelector("#signin-tab").addEventListener("click", () => setMode("signin"));
document.querySelector("#signup-tab").addEventListener("click", () => setMode("signup"));
document.querySelectorAll("[data-password-toggle]").forEach((button) => button.addEventListener("click", () => {
  const input = document.querySelector(`#${button.dataset.passwordToggle}`);
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  button.textContent = showing ? "Show" : "Hide";
  button.setAttribute("aria-pressed", String(!showing));
  button.setAttribute("aria-label", `${showing ? "Show" : "Hide"} ${button.dataset.passwordToggle === "confirm-password" ? "confirmed password" : "password"}`);
}));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  if (recoverySession) {
    if (password.value !== confirmPassword.value) {
      submit.disabled = false;
      status.textContent = "The two passwords do not match. Please enter them again.";
      confirmPassword.focus();
      return;
    }
    status.textContent = "Updating your password...";
    const { error } = await supabase.auth.updateUser({ password: password.value });
    submit.disabled = false;
    if (error) {
      status.textContent = error.message;
      return;
    }
    await supabase.auth.signOut({ scope: "others" }).catch(() => {});
    status.textContent = "Password updated. Checking account security...";
    try {
      await continueAfterAuthentication(safeReturnTo);
    } catch (error) {
      status.textContent = error.message || "Your password was updated, but account security could not be verified. Sign in again.";
    }
    return;
  }
  status.textContent = mode === "signup" ? "Creating your account..." : "Signing in...";

  const credentials = { email: email.value.trim(), password: password.value };
  const result = mode === "signup"
    ? await supabase.auth.signUp({
        ...credentials,
        options: { emailRedirectTo: signupTarget.href }
      })
    : await supabase.auth.signInWithPassword(credentials);

  submit.disabled = false;
  if (result.error) {
    status.textContent = result.error.message;
    return;
  }

  if (mode === "signup" && !result.data.session) {
    status.textContent = "Check your email to confirm your account, then return here to sign in.";
    return;
  }

  try {
    await continueAfterAuthentication(mode === "signup" ? signupTarget.href : safeReturnTo);
  } catch (error) {
    status.textContent = error.message || "Account security could not be verified. Please sign in again.";
  }
});

mfaCode.addEventListener("input", (event) => {
  event.target.value = cleanMfaCode(event.target.value);
});

mfaFactor.addEventListener("change", async () => {
  mfaCode.value = "";
  try {
    await prepareSelectedMfaFactor();
    mfaCode.focus();
  } catch (error) {
    status.textContent = error.message || "That two-step factor is unavailable.";
  }
});

document.querySelector("#mfa-send-phone-code").addEventListener("click", async () => {
  try {
    await prepareSelectedMfaFactor();
    mfaCode.focus();
  } catch (error) {
    status.textContent = error.message || "A new text-message code could not be sent.";
  }
});

mfaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = cleanMfaCode(mfaCode.value);
  if (!pendingMfaFactorId || code.length !== 6) {
    status.textContent = "Enter the six-digit code shown by your authenticator app.";
    return;
  }
  mfaSubmit.disabled = true;
  status.textContent = "Verifying your authenticator code…";
  const factor = selectedMfaFactor();
  const result = factor?.factor_type === "phone"
    ? pendingMfaChallengeId
      ? await supabase.auth.mfa.verify({ factorId: pendingMfaFactorId, challengeId: pendingMfaChallengeId, code })
      : { error: new Error("Send a text-message code before verifying.") }
    : await supabase.auth.mfa.challengeAndVerify({ factorId: pendingMfaFactorId, code });
  const { error } = result;
  mfaSubmit.disabled = false;
  if (error) {
    status.textContent = error.message || "That code could not be verified.";
    mfaCode.select();
    return;
  }
  status.textContent = "Verified. Opening your MealDaddy account…";
  location.replace(safeReturnTo);
});

document.querySelector("#mfa-use-another-account").addEventListener("click", async () => {
  await supabase.auth.signOut({ scope: "local" });
  location.reload();
});

document.querySelector("#reset-password").addEventListener("click", async () => {
  const address = email.value.trim();
  if (!address) {
    status.textContent = "Enter your email address first.";
    email.focus();
    return;
  }
  const recoveryTarget = new URL("./auth.html", location.href);
  recoveryTarget.searchParams.set("mode", "recovery");
  recoveryTarget.searchParams.set("returnTo", safeReturnTo);
  const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: recoveryTarget.href });
  status.textContent = error
    ? error.message
    : "MealDaddy password email sent. Open its Reset Password link, then return here to choose and confirm your new password.";
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") showRecoveryForm();
});
const { data } = await supabase.auth.getSession();
const recoveryParams = new URLSearchParams(location.search);
const recoveryRequested = recoveryParams.get("type") === "recovery" || recoveryParams.get("mode") === "recovery";
if (data.session && recoverySession) {
  // PASSWORD_RECOVERY is the trusted signal; a query parameter alone is not.
} else if (recoveryRequested) {
  status.textContent = "This page has not received a verified password-recovery session. Open the newest Reset Password link from your MealDaddy email, or request another link below.";
} else if (data.session) {
  try {
    await continueAfterAuthentication(safeReturnTo);
  } catch (error) {
    status.textContent = error.message || "Account security could not be verified. Please sign in again.";
  }
}
if (accountWasDeleted) {
  status.textContent = "Your Meal Daddy account and private app data were permanently deleted, and billing was stopped.";
}
