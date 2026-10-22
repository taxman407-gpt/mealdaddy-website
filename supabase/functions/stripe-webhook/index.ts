import { fulfillLifetimeCheckout } from "../_shared/lifetime-fulfillment.mjs";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const stripe = new Stripe(stripeKey);
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function namedKey(variable: string, fallback: string) {
  try {
    return JSON.parse(Deno.env.get(variable) ?? "{}").default ?? Deno.env.get(fallback);
  } catch {
    return Deno.env.get(fallback);
  }
}

function unixDate(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!stripeKey || !webhookSecret) return new Response("Webhook not configured", { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // supabase-js 2.54 treats sb_secret keys as Bearer JWTs; use the legacy server key until migration to @supabase/server.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    namedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return new Response("Database not configured", { status: 503 });
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: claimRows, error: claimError } = await admin.rpc("claim_stripe_webhook_event", {
    requested_event_id: event.id,
    requested_event_type: event.type
  });
  if (claimError) return new Response("Webhook event could not be claimed", { status: 503 });
  const claimStatus = claimRows?.[0]?.claim_status;
  if (claimStatus === "processed") return new Response("ok", { status: 200 });
  if (claimStatus === "in_progress") {
    return new Response("Webhook event is already processing", { status: 409 });
  }
  if (claimStatus !== "claimed") {
    return new Response("Webhook event could not be claimed", { status: 503 });
  }
  const claimToken = claimRows?.[0]?.claim_token;
  if (!claimToken) return new Response("Webhook event claim was incomplete", { status: 503 });

  const customerId = (subscription: Stripe.Subscription) =>
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const saveSubscription = async (
    userId: string,
    subscription: Stripe.Subscription,
    planKey: string | null
  ) => {
    const { error } = await admin.from("subscriptions").upsert({
      user_id: userId,
      stripe_customer_id: customerId(subscription),
      stripe_subscription_id: subscription.id,
      plan_key: planKey,
      status: subscription.status,
      trial_ends_at: unixDate(subscription.trial_end),
      current_period_ends_at: unixDate(subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString()
    });
    if (error) throw new Error(`Subscription write failed (${error.code || "database"})`);
  };

  try {
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment" && session.metadata?.billing_purpose === "lifetime_license") {
        if (Deno.env.get("ENABLE_LIFETIME_BILLING") !== "true") throw new Error("Lifetime fulfillment is disabled");
        await fulfillLifetimeCheckout({ session, admin, stripe, paidAt: new Date(event.created * 1000).toISOString() });
      }
    }
    if (event.type === "checkout.session.completed" && (event.data.object as Stripe.Checkout.Session).mode !== "payment") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id ?? session.client_reference_id;
      if (!userId) throw new Error("Checkout session is missing its Meal Daddy user reference");
      const subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
      if (!subscriptionId) throw new Error("Completed subscription checkout is missing a subscription");

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await saveSubscription(
        userId,
        subscription,
        session.metadata?.plan_key ?? subscription.metadata.plan_key ?? "core"
      );
      const { error: checkoutTrackingError } = await admin
        .from("stripe_checkout_sessions")
        .upsert({
          checkout_session_id: session.id,
          user_id: userId,
          stripe_customer_id: customerId(subscription),
          stripe_subscription_id: subscription.id,
          status: session.status ?? "complete",
          updated_at: new Date().toISOString()
        }, { onConflict: "checkout_session_id" });
      if (checkoutTrackingError) {
        throw new Error(`Checkout tracking update failed (${checkoutTrackingError.code || "database"})`);
      }
      const { error: trialGrantError } = await admin.rpc("mark_trial_checkout_granted", {
        requested_checkout_session_id: session.id
      });
      if (trialGrantError) throw new Error(`Trial grant update failed (${trialGrantError.code || "database"})`);
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id ?? session.client_reference_id;
      if (!userId) throw new Error("Expired Checkout Session is missing its Meal Daddy user reference");
      const { error: checkoutTrackingError } = await admin
        .from("stripe_checkout_sessions")
        .upsert({
          checkout_session_id: session.id,
          user_id: userId,
          stripe_customer_id: typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null,
          stripe_subscription_id: typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null,
          status: "expired",
          updated_at: new Date().toISOString()
        }, { onConflict: "checkout_session_id" });
      if (checkoutTrackingError) {
        throw new Error(`Checkout tracking update failed (${checkoutTrackingError.code || "database"})`);
      }
      const { error: trialReleaseError } = await admin.rpc("release_trial_checkout", {
        requested_checkout_session_id: session.id
      });
      if (trialReleaseError) throw new Error(`Trial release failed (${trialReleaseError.code || "database"})`);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const { data: existing, error: existingError } = await admin
        .from("subscriptions")
        .select("user_id,plan_key")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();
      if (existingError) throw new Error(`Subscription lookup failed (${existingError.code || "database"})`);
      const userId = subscription.metadata.user_id || existing?.user_id;
      if (!userId) throw new Error("Subscription event is missing its Meal Daddy user reference");
      await saveSubscription(
        userId,
        subscription,
        subscription.metadata.plan_key || existing?.plan_key || "core"
      );
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment" && session.metadata?.billing_purpose === "lifetime_license") {
        const userId = session.metadata.user_id;
        if (!userId || session.client_reference_id !== userId) throw new Error("Failed lifetime checkout ownership mismatch");
        const {error: failedCheckoutError} = await admin.from("stripe_checkout_sessions").update({status:"failed",updated_at:new Date().toISOString()}).eq("checkout_session_id",session.id).eq("user_id",userId);
        if (failedCheckoutError) throw new Error("Failed lifetime payment could not be reconciled");
      }
    }
    if (event.type === "charge.refunded" && Deno.env.get("ENABLE_LIFETIME_BILLING") === "true") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntent) {
        const {error: refundError} = await admin.rpc("record_lifetime_refund", {requested_payment_intent_id: paymentIntent, requested_refunded_cents: charge.amount_refunded});
        if (refundError) throw new Error("Lifetime refund reconciliation failed");
      }
    }
    const { data: completed, error: completeError } = await admin.rpc("complete_stripe_webhook_event", {
      requested_event_id: event.id,
      requested_claim_token: claimToken
    });
    if (completeError || completed !== true) {
      throw new Error(`Webhook completion could not be recorded (${completeError?.code || "state"})`);
    }
    return new Response("ok", { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    console.error("Stripe webhook processing failed", event.id, event.type, message);
    const { error: failureStateError } = await admin.rpc("fail_stripe_webhook_event", {
      requested_event_id: event.id,
      requested_claim_token: claimToken,
      requested_error: message
    });
    if (failureStateError) {
      console.error("Stripe webhook failure state could not be recorded", event.id, failureStateError.code);
    }
    return new Response("Webhook processing failed", { status: 500 });
  }
});
