import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" }
  });
}

function namedKey(listName: string, fallbackName: string) {
  const namedKeys = (Deno.env.get(listName) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return namedKeys[0] ?? Deno.env.get(fallbackName) ?? "";
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function jwtAssuranceLevel(authHeader: string) {
  try {
    const payload = authHeader.slice("Bearer ".length).split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).aal ?? "aal1";
  } catch {
    return "aal1";
  }
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const pageSize = 200;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw error;
    const match = data.users.find((candidate) => normalizeEmail(candidate.email) === email);
    if (match) return match;
    if (data.users.length < pageSize) return null;
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    namedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const allowedUserIds = (Deno.env.get("MEALDADDY_ADMIN_USER_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!supabaseUrl || !serviceKey || !allowedUserIds.length) {
    return json({ error: "Owner access is not configured." }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user: owner }, error: authError } = await admin.auth.getUser(
    authHeader.slice("Bearer ".length)
  );
  if (authError || !owner) return json({ error: "Authentication required." }, 401);
  if (!allowedUserIds.includes(owner.id)) {
    return json({ error: "This account is not authorized to manage family access." }, 403);
  }
  if (jwtAssuranceLevel(authHeader) !== "aal2") {
    return json({ error: "Owner multi-factor authentication is required for family-access administration." }, 403);
  }

  let action = "list";
  let email = "";
  let requestedUserId = "";
  try {
    const body = await request.json();
    action = typeof body?.action === "string" ? body.action : "list";
    email = normalizeEmail(body?.email);
    requestedUserId = typeof body?.userId === "string" ? body.userId.trim() : "";
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!new Set(["authorize", "list", "grant", "revoke"]).has(action)) {
    return json({ error: "Unknown family access action." }, 400);
  }
  if (action === "authorize") return json({ ok: true });

  if (action === "list") {
    const { data: grants, error } = await admin
      .from("complimentary_access_grants")
      .select("user_id,access_type,status,granted_at,revoked_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) return json({ error: "Family access records could not be loaded." }, 500);
    const rows = await Promise.all((grants ?? []).map(async (grant) => {
      const { data } = await admin.auth.admin.getUserById(grant.user_id);
      return { ...grant, email: normalizeEmail(data.user?.email) || "Account unavailable" };
    }));
    return json({ ok: true, grants: rows });
  }

  let member = null;
  if (requestedUserId) {
    const { data, error } = await admin.auth.admin.getUserById(requestedUserId);
    if (error) return json({ error: "That account could not be loaded." }, 404);
    member = data.user;
  } else if (email) {
    try {
      member = await findUserByEmail(admin, email);
    } catch {
      return json({ error: "The account directory could not be searched." }, 500);
    }
  }
  if (!member) {
    return json({ error: "No Meal Daddy account uses that email yet. Ask the family member to create their account first without starting checkout." }, 404);
  }

  const { data: resultingStatus, error: updateError } = await admin.rpc(
    "set_complimentary_family_access",
    {
      requested_user_id: member.id,
      requested_action: action,
      requested_by: owner.id
    }
  );
  if (updateError) {
    if (/Stripe membership already exists/i.test(updateError.message)) {
      return json({ error: "This account already has a current Stripe membership. Cancel or resolve that membership before granting complimentary access." }, 409);
    }
    if (/is not active/i.test(updateError.message)) {
      return json({ error: "This account does not currently have active complimentary family access." }, 409);
    }
    return json({ error: `Complimentary family access could not be ${action === "grant" ? "granted" : "revoked"}.` }, 500);
  }
  return json({
    ok: true,
    email: normalizeEmail(member.email),
    status: resultingStatus
  });
});
