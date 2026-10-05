import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { reconcileCheckoutSessionsForDeletion } from "../_shared/checkout-reconciliation.mjs";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json"
};

const cancellableStatuses = new Set([
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused"
]);
const terminalSubscriptionStatuses = new Set(["canceled", "incomplete_expired"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function namedKey(variable: string, fallback: string) {
  try {
    return JSON.parse(Deno.env.get(variable) ?? "{}").default ?? Deno.env.get(fallback);
  } catch {
    return Deno.env.get(fallback);
  }
}

function jwtAssuranceLevel(authHeader: string) {
  try {
    const encoded = authHeader.slice("Bearer ".length).split(".")[1];
    return JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))).aal ?? "aal1";
  } catch {
    return "aal1";
  }
}

async function removePrivatePhotos(
  admin: ReturnType<typeof createClient>,
  userId: string
) {
  for (const bucket of ["meal-photos", "saved-food-photos"]) {
    for (;;) {
      const { data, error: listError } = await admin.storage
        .from(bucket)
        .list(userId, { limit: 1000, offset: 0 });
      if (listError) throw new Error("Private photo inventory could not be checked.");

      const paths = (data ?? [])
        .filter((object) => Boolean(object.id))
        .map((object) => `${userId}/${object.name}`);
      if (!paths.length) break;

      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) throw new Error("Private photos could not be deleted.");
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // supabase-js 2.54 treats sb_secret keys as Bearer JWTs; use the legacy server key until migration to @supabase/server.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    namedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = namedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!supabaseUrl || !serviceKey || !publishableKey || !stripeKey) {
    return json({ error: "Secure account deletion is not configured." }, 503);
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Authentication required." }, 401);

  let payload: { confirmation?: string; currentPassword?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (payload.confirmation !== "DELETE MY ACCOUNT") {
    return json({ error: "Type DELETE MY ACCOUNT to confirm permanent deletion." }, 400);
  }
  if (!user.email || typeof payload.currentPassword !== "string" || payload.currentPassword.length < 8) {
    return json({ error: "Re-enter your current password before permanent deletion." }, 401);
  }
  const { data: reauthData, error: reauthError } = await authClient.auth.signInWithPassword({
    email: user.email,
    password: payload.currentPassword
  });
  if (reauthError || reauthData.user?.id !== user.id) {
    return json({ error: "Your password could not be verified. Nothing was deleted." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: factorData, error: factorError } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  if (factorError) {
    return json({ error: "Account security could not be verified. Nothing was deleted." }, 500);
  }
  const hasVerifiedFactor = (factorData.factors ?? []).some((factor) => factor.status === "verified");
  if (hasVerifiedFactor && jwtAssuranceLevel(authHeader) !== "aal2") {
    return json({ error: "Verify this session with your authenticator before permanent deletion." }, 403);
  }
  const { data: membership, error: membershipError } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) return json({ error: "Billing status could not be verified. Nothing was deleted." }, 500);

  const { data: checkoutSessions, error: checkoutSessionsError } = await admin
    .from("stripe_checkout_sessions")
    .select("checkout_session_id,stripe_subscription_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (checkoutSessionsError) {
    return json({ error: "Checkout status could not be verified. Nothing was deleted." }, 500);
  }

  let reconciledCheckoutSessionIds: string[] = [];
  try {
    const stripe = new Stripe(stripeKey);
    const reconciliation = await reconcileCheckoutSessionsForDeletion({
      stripe,
      userId: user.id,
      knownSubscriptionId: membership?.stripe_subscription_id,
      checkoutSessions: checkoutSessions ?? []
    });
    reconciledCheckoutSessionIds = reconciliation.reconciledCheckoutSessionIds;
    const subscriptions = reconciliation.subscriptions;
    for (const subscription of subscriptions) {
      if (cancellableStatuses.has(subscription.status)) {
        const canceled = await stripe.subscriptions.cancel(subscription.id, {
          invoice_now: false,
          prorate: false,
          cancellation_details: {
            comment: "Customer permanently deleted their Meal Daddy account."
          }
        });
        if (canceled.status !== "canceled") {
          throw new Error(`Stripe subscription ${subscription.id} did not confirm cancellation.`);
        }
      } else if (!terminalSubscriptionStatuses.has(subscription.status)) {
        throw new Error(`Stripe subscription ${subscription.id} returned an unknown status.`);
      }
    }
  } catch (error) {
    console.error("Stripe cancellation verification error", error instanceof Error ? error.message : "Unknown error");
    return json({
      error: "Billing cancellation could not be verified, so your account and data were not deleted. Please try again."
    }, 502);
  }

  try {
    await removePrivatePhotos(admin, user.id);
    for (let offset = 0; offset < reconciledCheckoutSessionIds.length; offset += 100) {
      const checkoutSessionIds = reconciledCheckoutSessionIds.slice(offset, offset + 100);
      const { data: removedSessions, error: removeSessionsError } = await admin
        .from("stripe_checkout_sessions")
        .delete()
        .eq("user_id", user.id)
        .in("checkout_session_id", checkoutSessionIds)
        .select("checkout_session_id");
      if (removeSessionsError || removedSessions?.length !== checkoutSessionIds.length) {
        throw new Error("Reconciled Checkout Session associations could not be cleared.");
      }
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  } catch (error) {
    console.error("Supabase account deletion error", error instanceof Error ? error.message : "Unknown error");
    return json({
      error: "Your subscription was stopped, but account deletion could not be completed. Please try again."
    }, 500);
  }

  return json({ ok: true });
});
