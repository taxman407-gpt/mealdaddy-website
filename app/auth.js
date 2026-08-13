import { supabase } from "./supabase-client.js?v=20260813-4";

const form = document.querySelector("#auth-form");
const email = document.querySelector("#email");
const password = document.querySelector("#password");
const confirmPassword = document.querySelector("#confirm-password");
const confirmPasswordLabel = document.querySelector("#confirm-password-label");
const status = document.querySelector("#auth-status");
const submit = document.querySelector("#auth-submit");
const title = document.querySelector("#auth-title");
const copy = document.querySelector("#auth-copy");
let mode = "signin";
let recoverySession = false;

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
    status.textContent = "Password updated. Opening your account...";
    location.replace(safeReturnTo);
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

  location.replace(mode === "signup" ? signupTarget.href : safeReturnTo);
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
const recoveryFromUrl = location.hash.includes("type=recovery") || recoveryParams.get("type") === "recovery" || recoveryParams.get("mode") === "recovery";
if (data.session && recoveryFromUrl) {
  showRecoveryForm();
} else if (data.session) location.replace(safeReturnTo);
if (accountWasDeleted) {
  status.textContent = "Your Meal Daddy account and private app data were permanently deleted, and billing was stopped.";
}
