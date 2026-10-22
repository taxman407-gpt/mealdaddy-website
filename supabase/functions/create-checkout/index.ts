import { membershipPlans, assertPlanPrice } from "../_shared/membership-policy.mjs";
import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { requireConditionalMfa } from "../_shared/conditional-mfa.ts";

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

function easternWeekStart(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    }).formatToParts(now).map(({ type, value }) => [type, value])
  );
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[parts.weekday];
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  return date.toISOString().slice(0, 10);
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
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const configuredOrigin = Deno.env.get("APP_ORIGIN");
  if (!supabaseUrl || !serviceKey || !stripeKey || !configuredOrigin) {
    return json({ error: "Checkout is not configured." }, 503);
  }
  const appOrigin = trustedAppOrigin(request, configuredOrigin);

  const authClient = createClient(
    supabaseUrl,
    namedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY") ?? "",
    {
    global: { headers: { Authorization: authHeader } }
    }
  );
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Authentication required." }, 401);

  let payload: { plan?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const plan = payload.plan ?? "";
  if (!["core", "byo"].includes(plan)) return json({ error: "Unknown subscription plan." }, 400);
  if (plan === "byo" && Deno.env.get("ENABLE_BYOK") !== "true") return json({ error: "BYOK checkout is not enabled in this environment." }, 503);
  const price = Deno.env.get(membershipPlans[plan].priceVariable);
  if (!price) return json({ error: "Checkout is not configured for this plan." }, 503);

  const admin = createClient(supabaseUrl, serviceKey);
  const mfaResult = await requireConditionalMfa(admin, user.id, authHeader);
  if (!mfaResult.ok) return json({ error: mfaResult.error }, mfaResult.status);
  const { data: complimentaryGrant, error: grantError } = await admin
    .from("complimentary_access_grants")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (grantError) return json({ error: "Membership status could not be checked." }, 500);
  if (complimentaryGrant?.status === "active") {
    return json({ error: "This account already has Complimentary Family Access and does not need a paid checkout." }, 409);
  }
  const { data: existingMembership, error: membershipError } = await admin
    .from("subscriptions")
    .select("status,stripe_customer_id,stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) return json({ error: "Membership status could not be checked." }, 500);
  if (existingMembership && ["trialing", "active", "past_due", "unpaid", "paused", "incomplete"].includes(existingMembership.status)) {
    return json({ error: "This account already has a current membership. Use Manage billing instead of starting another checkout.", existingMembership: true }, 409);
  }
  if (Deno.env.get("ENABLE_LIFETIME_BILLING") === "true") {
    const {data: license, error: licenseError} = await admin.from("lifetime_licenses").select("status").eq("user_id",user.id).maybeSingle();
    if (licenseError) return json({error:"Lifetime membership could not be checked."},503);
    if (license && ["paid","reconciliation_required"].includes(license.status)) return json({error:"A lifetime license already exists. Use maintenance renewal instead of creating a second membership."},409);
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2026-08-26.dahlia" });
  try { assertPlanPrice(plan, await stripe.prices.retrieve(price)); }
  catch { return json({ error: "The configured billing price does not match the advertised plan. No checkout was created." }, 503); }
  const { data: reservationRows, error: reserveError } = plan === "core" ? await admin.rpc(
    "reserve_weekly_subscription_trial",
    {
      requested_user_id: user.id,
      requested_week_start: easternWeekStart(),
      requested_weekly_limit: 2000
    }
  ) : {data:[{eligible:false}],error:null};
  if (reserveError) return json({ error: "Trial availability could not be checked." }, 500);

  const reservation = reservationRows?.[0];
  const eligible = Boolean(reservation?.eligible && reservation?.reservation_id);

  try {
    const session = await stripe.checkout.sessions.create({
      integration_identifier: "mealdaddy_october_hkqzpmte",
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      ...(existingMembership?.stripe_customer_id
        ? { customer: existingMembership.stripe_customer_id }
        : { customer_email: user.email }),
      client_reference_id: user.id,
      success_url: `${appOrigin}/app/app.html?checkout=success`,
      cancel_url: `${appOrigin}/app/index.html?checkout=cancelled`,
      allow_promotion_codes: true,
      metadata: { user_id: user.id, plan_key: plan },
      subscription_data: {
        metadata: { user_id: user.id, plan_key: plan },
        ...(eligible ? {
          trial_period_days: 7,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          metadata: {
            user_id: user.id,
            plan_key: plan,
            mealdaddy_trial_week: easternWeekStart(),
            mealdaddy_trial_reservation: reservation.reservation_id
          }
        } : {})
      }
    }, { idempotencyKey: `mealdaddy-${plan}-${user.id}-${easternWeekStart()}` });

    const { error: checkoutTrackingError } = await admin
      .from("stripe_checkout_sessions")
      .upsert({
        checkout_session_id: session.id,
        user_id: user.id,
        stripe_customer_id: typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null,
        stripe_subscription_id: typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null,
        status: session.status ?? "unknown",
        updated_at: new Date().toISOString()
      }, { onConflict: "checkout_session_id" });
    if (checkoutTrackingError) {
      try {
        if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      } catch (expirationError) {
        console.error(
          "Untracked Checkout Session could not be expired",
          session.id,
          expirationError instanceof Error ? expirationError.message : "Unknown error"
        );
      }
      throw new Error("Checkout Session ownership could not be recorded.");
    }

    if (eligible) {
      const { error: attachError } = await admin.rpc("attach_trial_checkout", {
        requested_reservation_id: reservation.reservation_id,
        requested_user_id: user.id,
        requested_checkout_session_id: session.id
      });
      if (attachError) {
        const expiredSession = await stripe.checkout.sessions.expire(session.id);
        await admin
          .from("stripe_checkout_sessions")
          .update({ status: expiredSession.status ?? "expired", updated_at: new Date().toISOString() })
          .eq("checkout_session_id", session.id);
        await admin.rpc("release_trial_reservation", {
          requested_reservation_id: reservation.reservation_id,
          requested_user_id: user.id
        });
        return json({ error: "Checkout could not reserve the trial." }, 500);
      }
    }

    return json({ url: session.url, trialDays: eligible ? 7 : 0 });
  } catch {
    if (eligible) {
      await admin.rpc("release_trial_reservation", {
        requested_reservation_id: reservation.reservation_id,
        requested_user_id: user.id
      });
    }
    return json({ error: "Checkout could not be created." }, 502);
  }
});
