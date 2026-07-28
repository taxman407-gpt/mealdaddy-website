import { supabase } from "./supabase-client.js";

const form = document.querySelector("#auth-form");
const email = document.querySelector("#email");
const password = document.querySelector("#password");
const status = document.querySelector("#auth-status");
const submit = document.querySelector("#auth-submit");
const title = document.querySelector("#auth-title");
const copy = document.querySelector("#auth-copy");
let mode = "signin";

const returnTo = new URLSearchParams(location.search).get("returnTo") || "./app.html";
const safeReturnTo = returnTo.startsWith("/") || returnTo.startsWith("./") ? returnTo : "./app.html";

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  status.textContent = mode === "signup" ? "Creating your account..." : "Signing in...";

  const credentials = { email: email.value.trim(), password: password.value };
  const result = mode === "signup"
    ? await supabase.auth.signUp({
        ...credentials,
        options: { emailRedirectTo: new URL("./app.html#onboarding", location.href).href }
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

  location.replace(mode === "signup" ? "./app.html#onboarding" : safeReturnTo);
});

document.querySelector("#reset-password").addEventListener("click", async () => {
  const address = email.value.trim();
  if (!address) {
    status.textContent = "Enter your email address first.";
    email.focus();
    return;
  }
  const { error } = await supabase.auth.resetPasswordForEmail(address, {
    redirectTo: new URL("./auth.html", location.href).href
  });
  status.textContent = error ? error.message : "Password reset email sent.";
});

const { data } = await supabase.auth.getSession();
if (data.session) location.replace(safeReturnTo);
