type MfaAdminClient = {
  auth: {
    admin: {
      mfa: {
        listFactors: (parameters: { userId: string }) => Promise<{
          data: { factors?: Array<{ status?: string }> } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

export type ConditionalMfaResult =
  | { ok: true }
  | { ok: false; status: 403 | 500; error: string };

function jwtAssuranceLevel(authHeader: string) {
  try {
    const encoded = authHeader.slice("Bearer ".length).split(".")[1] ?? "";
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    return payload.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

/**
 * Call only after auth.getUser() has validated this same bearer token and user.
 * The live factor inventory is authoritative: enrolled users must use an aal2
 * session, while users without a verified factor retain ordinary aal1 access.
 */
export async function requireConditionalMfa(
  admin: MfaAdminClient,
  userId: string,
  authHeader: string
): Promise<ConditionalMfaResult> {
  let factorResult: Awaited<ReturnType<MfaAdminClient["auth"]["admin"]["mfa"]["listFactors"]>>;
  try {
    factorResult = await admin.auth.admin.mfa.listFactors({ userId });
  } catch {
    return {
      ok: false,
      status: 500,
      error: "Account security could not be verified. Please try again."
    };
  }

  if (factorResult.error || !Array.isArray(factorResult.data?.factors)) {
    return {
      ok: false,
      status: 500,
      error: "Account security could not be verified. Please try again."
    };
  }

  const hasVerifiedFactor = factorResult.data.factors.some((factor) => factor.status === "verified");
  if (hasVerifiedFactor && jwtAssuranceLevel(authHeader) !== "aal2") {
    return {
      ok: false,
      status: 403,
      error: "Verify this session with your authenticator before continuing."
    };
  }

  return { ok: true };
}
