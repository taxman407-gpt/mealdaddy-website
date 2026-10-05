import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2.54.0";

type OwnerUser = Pick<User, "id" | "email" | "email_confirmed_at">;

export type OwnerAuthorizationResult =
  | { ok: true }
  | { ok: false; status: 403 | 500; error: string };

function configuredValues(variable: string) {
  return (Deno.env.get(variable) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function jwtIdentity(authHeader: string) {
  try {
    const encoded = authHeader.slice("Bearer ".length).split(".")[1] ?? "";
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    return {
      aal: payload.aal === "aal2" ? "aal2" : "aal1",
      subject: typeof payload.sub === "string" ? payload.sub : ""
    };
  } catch {
    return { aal: "aal1", subject: "" };
  }
}

function denied(error: string): OwnerAuthorizationResult {
  return { ok: false, status: 403, error };
}

function unavailable(): OwnerAuthorizationResult {
  return {
    ok: false,
    status: 500,
    error: "Owner access could not be verified. Please try again."
  };
}

/**
 * Call only after auth.getUser() has validated this same bearer token and user.
 * Every owner path requires an aal2 session backed by a currently verified
 * phone or TOTP factor before configured IDs, registry membership, or the
 * one-time legacy-email bootstrap are considered.
 */
export async function requireOwnerAuthorization(
  admin: SupabaseClient,
  user: OwnerUser,
  authHeader: string
): Promise<OwnerAuthorizationResult> {
  const jwt = jwtIdentity(authHeader);
  if (jwt.aal !== "aal2" || jwt.subject !== user.id) {
    return denied("Owner multi-factor authentication is required.");
  }

  let factorResult: Awaited<ReturnType<typeof admin.auth.admin.mfa.listFactors>>;
  try {
    factorResult = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  } catch {
    return unavailable();
  }

  if (factorResult.error || !Array.isArray(factorResult.data?.factors)) {
    return unavailable();
  }

  const hasLiveVerifiedFactor = factorResult.data.factors.some((factor) =>
    factor.status === "verified" &&
    (factor.factor_type === "totp" || factor.factor_type === "phone")
  );
  if (!hasLiveVerifiedFactor) {
    return denied("A current owner authenticator is required.");
  }

  const configuredOwnerIds = configuredValues("MEALDADDY_ADMIN_USER_IDS");
  if (configuredOwnerIds.includes(user.id)) return { ok: true };

  let registryResult;
  try {
    registryResult = await admin
      .from("owner_accounts")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
  } catch {
    return unavailable();
  }
  if (registryResult.error) return unavailable();
  if (registryResult.data) return { ok: true };
  if (configuredOwnerIds.length) {
    return denied("This account is not authorized to use owner tools.");
  }

  const verifiedEmail = user.email_confirmed_at ? normalizeEmail(user.email) : "";
  const legacyOwnerEmails = configuredValues("FEEDBACK_ADMIN_EMAILS").map(normalizeEmail);
  if (!verifiedEmail || !legacyOwnerEmails.includes(verifiedEmail)) {
    return denied("This account is not authorized to use owner tools.");
  }

  let bootstrapResult;
  try {
    bootstrapResult = await admin.rpc("bootstrap_owner_account", {
      requested_user_id: user.id
    });
  } catch {
    return unavailable();
  }
  if (bootstrapResult.error) return unavailable();
  if (bootstrapResult.data === true) return { ok: true };

  return denied("This account is not authorized to use owner tools.");
}
