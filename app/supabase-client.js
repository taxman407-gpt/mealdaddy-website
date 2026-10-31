import { createOptionalDiagnostics } from "./optional-diagnostics.js?v=20261031-1";
import { createClient } from "./vendor/supabase-js.js?v=20260813-4";
import { initializeEntryFeedback, observeEstimateRequest } from "./entry-reliability.js?v=20261016-1";

const SUPABASE_URL = "https://egbieqvbwniaxgqjzqkp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fvCS-xqbn7q5hLUuqFxl5w_uac4cNmc";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const returnTo = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace(`./auth.html?returnTo=${returnTo}`);
    return null;
  }
  const [factorResult, assurance] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  if (factorResult.error) throw factorResult.error;
  if (assurance.error) throw assurance.error;
  const hasVerifiedFactor = (factorResult.data.all || []).some((factor) => factor.status === "verified");
  if (hasVerifiedFactor && assurance.data.currentLevel !== "aal2") {
    const returnTo = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace(`./auth.html?mfa=required&returnTo=${returnTo}`);
    return null;
  }
  // Billing management/export/deletion remain available without an adult confirmation.
  const eligibilityExempt = /\/(?:adult-eligibility|account)(?:\.html)?\/?$/.test(location.pathname);
  if (!eligibilityExempt) {
    const age = await supabase.from('adult_eligibility').select('confirmed_adult,policy_version').eq('user_id',data.session.user.id).maybeSingle();
    if (age.error || age.data?.confirmed_adult !== true || age.data.policy_version !== 1) {
      location.replace('./adult-eligibility.html');
      return null;
    }
  }
  // Mount only when the Quick Log form exists. Other account screens are unchanged.
  initializeEntryFeedback();
  return data.session;
}

const reportOptionalDiagnostic = createOptionalDiagnostics(supabase);

export async function invokeAuthenticated(functionName, options = {}) {
  const started = performance.now();
  try {
    const result = await invokeWithFeedback(functionName, options);
    void reportOptionalDiagnostic(functionName, performance.now()-started, Boolean(result?.error));
    return result;
  } catch (error) {
    void reportOptionalDiagnostic(functionName, performance.now()-started, true);
    throw error;
  }
}

async function invokeWithFeedback(functionName, options = {}) {
  if (functionName === "estimate-entry") {
    return observeEstimateRequest(() => invokeAuthenticatedRequest(functionName, options), options.body);
  }
  return invokeAuthenticatedRequest(functionName, options);
}

async function invokeAuthenticatedRequest(functionName, options = {}) {
  const current = await supabase.auth.getSession();
  if (current.error) return { data: null, error: current.error };
  let session = current.data.session;
  const expiresSoon = session?.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 120;
  if (expiresSoon) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) return { data: null, error: refreshed.error };
    session = refreshed.data.session;
  }
  if (!session?.access_token) {
    return { data: null, error: new Error("Your secure session expired. Sign in again, then retry.") };
  }
  const invokeWithToken = (accessToken) => supabase.functions.invoke(functionName, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${accessToken}`
      }
    });
  let result = await invokeWithToken(session.access_token);
  if (result.error?.context instanceof Response && result.error.context.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.data.session?.access_token;
    if (!refreshed.error && refreshedToken) result = await invokeWithToken(refreshedToken);
  }
  if (result.error?.context instanceof Response) {
    const payload = await result.error.context.clone().json().catch(() => null);
    const safeMessage = typeof payload?.error === "string" ? payload.error : "";
    if (safeMessage) return { data: payload, error: new Error(safeMessage) };
  }
  return result;
}
