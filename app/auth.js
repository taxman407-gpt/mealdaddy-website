import { pendingReferral } from "./referral-client.js?v=20261022-1";
import { supabase } from "./supabase-client.js?v=20261004-1";

const form = document.querySelector("#auth-form");
const email = document.querySelector("#email");
const password = document.querySelector("#password");
const confirmPassword = document.querySelector("#confirm-password");
const confirmPasswordLabel = document.querySelector("#confirm-password-label");
const recoveryCodeLabel = document.querySelector("#recovery-code-label");
const recoveryCode = document.querySelector("#recovery-code");
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
let recoveryCodeRequested = false;
let recoveryCodeVerificationPending = false;
let recoveryRequestPending = false;
let recoveryRequestAfter = 0;
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
  copy.textContent = recoverySession
    ? "Your recovery code or link was accepted. Complete two-step verification before choosing your new password."
    : "Your password was accepted. Complete two-step verification to finish signing in.";
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

function showRecoveryCodeForm() {
  recoveryCodeRequested = true;
  recoverySession = false;
  mfaForm.hidden = true;
  form.hidden = false;
  document.querySelector(".auth-tabs").hidden = true;
  document.querySelector("#signup-adult-label").hidden = true;
  document.querySelector("#signup-adult").required = false;
  email.closest("label").hidden = false;
  email.required = true;
  recoveryCodeLabel.hidden = false;
  recoveryCode.required = true;
  title.textContent = "Reset your MealDaddy password";
  copy.textContent = "Open the reset link in your email, or enter its six-digit code below and choose a new password.";
  password.value = "";
  password.autocomplete = "new-password";
  confirmPasswordLabel.hidden = false;
  confirmPassword.required = true;
  submit.textContent = "Verify code and save password";
  document.querySelector("#reset-password").hidden = false;
  document.querySelector("#reset-password").textContent = "Resend recovery code";
  status.textContent = "Enter the six-digit recovery code sent to your email.";
}

function showRecoveryForm(options = {}) {
  recoverySession = true;
  recoveryCodeRequested = false;
  recoveryCodeLabel.hidden = true;
  recoveryCode.required = false;
  document.querySelector("#signup-adult-label").hidden = true;
  document.querySelector("#signup-adult").required = false;
  mfaForm.hidden = true;
  form.hidden = false;
  document.querySelector(".auth-tabs").hidden = true;
  email.closest("label").hidden = true;
  email.required = false;
  title.textContent = "Choose a new MealDaddy password";
  copy.textContent = "Enter and confirm a new password below. Use at least eight characters.";
  if (!options.preservePassword) {
    password.value = "";
    confirmPassword.value = "";
  }
  password.autocomplete = "new-password";
  confirmPasswordLabel.hidden = false;
  confirmPassword.required = true;
  submit.textContent = "Save new password";
  document.querySelector("#reset-password").hidden = true;
  status.textContent = "Your recovery code or link was verified. Choose your new password.";
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
  document.querySelector("#signup-adult-label").hidden = !signingUp;
  document.querySelector("#signup-adult").required = signingUp;
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
recoveryCode.addEventListener("input", (event) => {
  event.target.value = String(event.target.value || "").replace(/\D/g, "").slice(0, 6);
});

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
  if (submit.disabled) return;
  submit.disabled = true;
  if (recoveryCodeRequested && !recoverySession) {
    if (password.value !== confirmPassword.value) {
      submit.disabled = false;
      status.textContent = "The two passwords do not match. Please enter them again.";
      confirmPassword.focus();
      return;
    }
    const token = String(recoveryCode.value || "").replace(/\D/g, "").slice(0, 6);
    if (token.length !== 6) {
      submit.disabled = false;
      status.textContent = "Enter the six-digit code from your recovery email.";
      recoveryCode.focus();
      return;
    }
    status.textContent = "Verifying your recovery code…";
    const requestedPassword = password.value;
    const requestedConfirmation = confirmPassword.value;
    let verification;
    try {
      recoveryCodeVerificationPending = true;
      verification = await supabase.auth.verifyOtp({
        email: email.value.trim(), token, type: "recovery"
      });
    } catch (error) {
      verification = { error };
    } finally {
      recoveryCodeVerificationPending = false;
    }
    const { error } = verification;
    if (error) {
      submit.disabled = false;
      status.textContent = error.message || "That recovery code could not be verified. Request a fresh code and try again.";
      recoveryCode.select();
      return;
    }
    showRecoveryForm({ preservePassword: true });
    password.value = requestedPassword;
    confirmPassword.value = requestedConfirmation;
  }
  if (recoverySession) {
    try {
      const factors = await requiredMfaFactors();
      if (factors) {
        password.value = "";
        confirmPassword.value = "";
        await showMfaForm(factors);
        submit.disabled = false;
        return;
      }
    } catch (error) {
      submit.disabled = false;
      status.textContent = error.message || "Account security could not be verified. Your password has not been changed.";
      return;
    }
    if (password.value !== confirmPassword.value) {
      submit.disabled = false;
      status.textContent = "The two passwords do not match. Please enter them again.";
      confirmPassword.focus();
      return;
    }
    if (password.value.length < 8) {
      submit.disabled = false;
      status.textContent = "Use at least eight characters for your new password.";
      password.focus();
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

  if (mode === "signup" && !document.querySelector("#signup-adult").checked) { status.textContent="You must be at least 18 to create a MealDaddy account."; submit.disabled=false; return; }
  const credentials = { email: email.value.trim(), password: password.value };
  const result = mode === "signup"
    ? await supabase.auth.signUp({
        ...credentials,
        options: { emailRedirectTo: signupTarget.href, data: { signup_referral_code: pendingReferral() || null } }
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
  if (recoverySession) {
    showRecoveryForm();
    status.textContent = "Two-step verification complete. Enter and confirm your new password.";
    password.focus();
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
  if (recoveryRequestPending) return;
  if (Date.now() < recoveryRequestAfter) {
    status.textContent = "Please wait a minute before requesting another recovery email. Check your inbox and spam folder for the newest message.";
    return;
  }
  const address = email.value.trim();
  if (!address) {
    status.textContent = "Enter your email address first.";
    email.focus();
    return;
  }
  const resetButton = document.querySelector("#reset-password");
  const recoveryTarget = new URL("./auth.html", location.href);
  recoveryTarget.searchParams.set("mode", "recovery");
  recoveryTarget.searchParams.set("returnTo", safeReturnTo);
  recoveryRequestPending = true;
  resetButton.disabled = true;
  status.textContent = "Requesting your recovery email…";
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: recoveryTarget.href });
    if (error) throw error;
    recoveryRequestAfter = Date.now() + 60000;
    history.replaceState(null, "", recoveryTarget.href);
    showRecoveryCodeForm();
    status.textContent = "Recovery email requested. Open its reset link, or enter the six-digit code if the email includes one. Check your spam folder too.";
  } catch (error) {
    const limited = error?.status === 429 || /rate|too many/i.test(error?.code || "") || /rate.*limit|too many/i.test(error?.message || "");
    if (limited) recoveryRequestAfter = Date.now() + 60000;
    status.textContent = limited
      ? "The email service is temporarily rate-limited. Do not keep resending. Use the newest recovery email already received, or try again later."
      : error?.message || "The recovery email request could not be completed. Your password has not changed.";
  } finally {
    recoveryRequestPending = false;
    resetButton.disabled = false;
  }
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY" && !recoveryCodeVerificationPending && !recoverySession) showRecoveryForm();
});
const { data } = await supabase.auth.getSession();
const recoveryParams = new URLSearchParams(location.search);
const recoveryRequested = recoveryParams.get("type") === "recovery" || recoveryParams.get("mode") === "recovery";
if (data.session && recoverySession) {
  // PASSWORD_RECOVERY is the trusted signal; a query parameter alone is not.
} else if (recoveryRequested) {
  showRecoveryCodeForm();
  status.textContent = "Open the reset link in your recovery email, or enter its six-digit code below. Request a new email only if the existing one has expired.";
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
