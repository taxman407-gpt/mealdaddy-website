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
