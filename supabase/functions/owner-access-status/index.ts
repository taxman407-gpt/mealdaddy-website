import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "vary": "Authorization"
    }
  });
}

function configuredValues(name: string) {
  return [...new Set((Deno.env.get(name) ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

/**
 * Read-only navigation eligibility, NOT administrative authorization.
 * Uses only a server-validated identity and trusted owner configuration.
 * Does not bootstrap owners, modify access, return account lists, or bypass MFA.
 * All administrative actions still use requireOwnerAuthorization().
 */
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || !authHeader.slice(7).trim()) {
    return json({ error: "Authentication required." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // Use the same server-key source as the existing owner-management function.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    (Deno.env.get("SUPABASE_SECRET_KEYS") ?? "").split(",").map((value) => value.trim()).find(Boolean);
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Owner access could not be checked." }, 503);
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error: authError } = await admin.auth.getUser(authHeader.slice(7));
    const user = data?.user;
    if (authError || !user) return json({ error: "Authentication required." }, 401);

    const { data: owners, error: registryError } = await admin
      .from("owner_accounts").select("user_id").limit(2);
    if (registryError || !Array.isArray(owners)) {
      return json({ error: "Owner access could not be checked." }, 503);
    }

    // Only one designated owner may see this entry point. An existing immutable
    // registry takes precedence; do not expand it via an email or profile claim.
    if (owners.length > 0) {
      return json({ ok: true, isOwner: owners.length === 1 && owners[0].user_id === user.id });
    }

    const ownerIds = configuredValues("MEALDADDY_ADMIN_USER_IDS");
    if (ownerIds.length > 0) {
      return json({ ok: true, isOwner: ownerIds.length === 1 && ownerIds[0] === user.id.toLowerCase() });
    }

    // Recognize the existing legacy owner before their first MFA bootstrap,
    // without performing that bootstrap or granting administrative privileges.
    const ownerEmails = configuredValues("FEEDBACK_ADMIN_EMAILS");
    const verifiedEmail = user.email_confirmed_at && typeof user.email === "string"
      ? user.email.trim().toLowerCase() : "";
    return json({
      ok: true,
      isOwner: ownerEmails.length === 1 && Boolean(verifiedEmail) && ownerEmails[0] === verifiedEmail
    });
  } catch {
    return json({ error: "Owner access could not be checked." }, 503);
  }
});
