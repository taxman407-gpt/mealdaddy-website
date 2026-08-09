import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

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
    const returnTo = encodeURIComponent(location.pathname + location.hash);
    location.replace(`./auth.html?returnTo=${returnTo}`);
    return null;
  }
  return data.session;
}

export async function invokeAuthenticated(functionName, options = {}) {
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
  return supabase.functions.invoke(functionName, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session.access_token}`
    }
  });
}
