import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json"
};

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

function trustedAppOrigin(request: Request, configuredOrigin: string) {
  const requestedOrigin = request.headers.get("origin")?.replace(/\/$/, "") ?? "";
  const allowedOrigins = new Set([
    configuredOrigin.replace(/\/$/, ""),
    "https://mealdaddy.ai",
    "https://www.mealdaddy.ai",
    "https://mealdaddy-website.taxman407.workers.dev"
  ]);
  return allowedOrigins.has(requestedOrigin)
    ? requestedOrigin
    : configuredOrigin.replace(/\/$/, "");
}

async function portalConfiguration(stripe: Stripe, appOrigin: string) {
  const configurations = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100
  });
  const existing = configurations.data.find(
    (configuration) =>
      configuration.metadata.mealdaddy_account_privacy === "v1" &&
      configuration.features.subscription_cancel.enabled
  );
  if (existing) return existing.id;

  const configuration = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "Manage your Meal Daddy membership securely with Stripe."
    },
    default_return_url: `${appOrigin}/app/account.html?billing=returned`,
    features: {
      customer_update: {
        enabled: false,
        allowed_updates: []
      },
      invoice_history: {
        enabled: true
      },
      payment_method_update: {
        enabled: true
      },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: {
          enabled: true,
          options: [
            "too_expensive",
            "missing_features",
            "switched_service",
            "too_complex",
            "unused",
            "other"
          ]
        }
      },
      subscription_update: {
        enabled: false,
        default_allowed_updates: [],
        proration_behavior: "none"
      }
    },
    metadata: {
      mealdaddy_account_privacy: "v1"
    }
  });
  return configuration.id;
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
  const configuredOrigin = Deno.env.get("APP_ORIGIN");
  if (!supabaseUrl || !serviceKey || !publishableKey || !stripeKey || !configuredOrigin) {
    return json({ error: "Billing management is not configured." }, 503);
  }

  const appOrigin = trustedAppOrigin(request, configuredOrigin);
  const authClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Authentication required." }, 401);

  let payload: { action?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const action = payload.action === "cancel" ? "cancel" : "manage";

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: membership, error: membershipError } = await admin
    .from("subscriptions")
    .select("stripe_customer_id,stripe_subscription_id,status,cancel_at_period_end")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) return json({ error: "Membership details could not be loaded." }, 500);
  if (!membership?.stripe_customer_id) {
    return json({ error: "No Stripe membership is connected to this account." }, 409);
  }
  if (action === "cancel" && !membership.stripe_subscription_id) {
    return json({ error: "No active subscription is connected to this account." }, 409);
  }
  if (action === "cancel" && membership.cancel_at_period_end) {
    return json({ error: "Cancellation is already scheduled." }, 409);
  }

  try {
    const stripe = new Stripe(stripeKey);
    const configuration = await portalConfiguration(stripe, appOrigin);
    const returnUrl = `${appOrigin}/app/account.html?billing=returned`;
    const session = await stripe.billingPortal.sessions.create({
      customer: membership.stripe_customer_id,
      configuration,
      return_url: returnUrl,
      ...(action === "cancel" ? {
        flow_data: {
          type: "subscription_cancel",
          subscription_cancel: {
            subscription: membership.stripe_subscription_id
          },
          after_completion: {
            type: "redirect",
            redirect: { return_url: returnUrl }
          }
        }
      } : {})
    });
    return json({ url: session.url });
  } catch (error) {
    console.error("Stripe billing portal error", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Secure billing management could not be opened. Please try again." }, 502);
  }
});
