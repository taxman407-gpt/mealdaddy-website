import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.54.0";

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

async function findMealDaddySubscriptions(
  stripe: Stripe,
  userId: string,
  knownSubscriptionId?: string | null
) {
  const found = new Map<string, Stripe.Subscription>();

  if (knownSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(knownSubscriptionId);
      if (subscription.metadata.user_id === userId) found.set(subscription.id, subscription);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? error.code : "";
      if (code !== "resource_missing") throw error;
    }
  }

  let page: string | undefined;
  do {
    const result = await stripe.subscriptions.search({
      query: `metadata['user_id']:'${userId}'`,
      limit: 100,
      ...(page ? { page } : {})
    });
    for (const subscription of result.data) found.set(subscription.id, subscription);
    page = result.has_more ? result.next_page ?? undefined : undefined;
  } while (page);

  return [...found.values()];
}

async function removePrivatePhotos(
  admin: ReturnType<typeof createClient>,
  userId: string
) {
  for (;;) {
    const { data, error: listError } = await admin.storage
      .from("meal-photos")
      .list(userId, { limit: 1000, offset: 0 });
    if (listError) throw new Error("Private photo inventory could not be checked.");

    const paths = (data ?? [])
      .filter((object) => Boolean(object.id))
      .map((object) => `${userId}/${object.name}`);
    if (!paths.length) return;

    const { error: removeError } = await admin.storage.from("meal-photos").remove(paths);
    if (removeError) throw new Error("Private photos could not be deleted.");
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

  let payload: { confirmation?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (payload.confirmation !== "DELETE MY ACCOUNT") {
    return json({ error: "Type DELETE MY ACCOUNT to confirm permanent deletion." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: membership, error: membershipError } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) return json({ error: "Billing status could not be verified. Nothing was deleted." }, 500);

  try {
    const stripe = new Stripe(stripeKey);
    const subscriptions = await findMealDaddySubscriptions(
      stripe,
      user.id,
      membership?.stripe_subscription_id
    );
    for (const subscription of subscriptions) {
      if (!cancellableStatuses.has(subscription.status)) continue;
      await stripe.subscriptions.cancel(subscription.id, {
        invoice_now: false,
        prorate: false,
        cancellation_details: {
          comment: "Customer permanently deleted their Meal Daddy account."
        }
      });
    }
  } catch (error) {
    console.error("Stripe cancellation verification error", error instanceof Error ? error.message : "Unknown error");
    return json({
      error: "Billing cancellation could not be verified, so your account and data were not deleted. Please try again."
    }, 502);
  }

  try {
    await removePrivatePhotos(admin, user.id);
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
