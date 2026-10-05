function subscriptionOwner(subscription) {
  return String(subscription?.metadata?.user_id || "").trim();
}

function assertSubscriptionOwner(subscription, userId) {
  const owner = subscriptionOwner(subscription);
  if (owner && owner !== userId) {
    throw new Error("A Stripe subscription was associated with a different account.");
  }
}

async function addSubscriptionById(stripe, found, subscriptionId, userId) {
  const id = String(subscriptionId || "").trim();
  if (!id || found.has(id)) return;
  const subscription = await stripe.subscriptions.retrieve(id);
  assertSubscriptionOwner(subscription, userId);
  found.set(subscription.id, subscription);
}

function addSubscriptionObject(found, subscription, userId) {
  if (!subscription?.id) throw new Error("Stripe returned an incomplete subscription record.");
  assertSubscriptionOwner(subscription, userId);
  found.set(subscription.id, subscription);
}

function assertCheckoutOwner(session, userId) {
  const references = [session?.client_reference_id, session?.metadata?.user_id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!references.length || references.some((value) => value !== userId)) {
    throw new Error("A Stripe Checkout Session could not be matched to this account.");
  }
}

/**
 * Reconciles every durable Checkout Session association before account deletion.
 * Callers must remove only the returned session IDs, never every row for a user;
 * an association created concurrently must remain to block auth-user deletion.
 */
export async function reconcileCheckoutSessionsForDeletion({
  stripe,
  userId,
  knownSubscriptionId = null,
  checkoutSessions = []
}) {
  const found = new Map();
  const reconciledCheckoutSessionIds = [];

  if (knownSubscriptionId) {
    await addSubscriptionById(stripe, found, knownSubscriptionId, userId);
  }

  for (const association of checkoutSessions) {
    const checkoutSessionId = String(association?.checkout_session_id || "").trim();
    if (!checkoutSessionId) {
      throw new Error("A durable Checkout Session association was incomplete.");
    }

    let session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ["subscription"]
    });
    assertCheckoutOwner(session, userId);
    if (session.mode && session.mode !== "subscription") {
      throw new Error("An unexpected Checkout Session mode could not be reconciled.");
    }

    if (session.status === "open") {
      session = await stripe.checkout.sessions.expire(checkoutSessionId);
      assertCheckoutOwner(session, userId);
      if (session.status !== "expired") {
        throw new Error("An open Checkout Session could not be expired.");
      }
    } else if (session.status !== "complete" && session.status !== "expired") {
      throw new Error("A Checkout Session returned an unknown billing state.");
    }

    const sessionSubscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? "";
    const trackedSubscriptionId = String(association.stripe_subscription_id || "").trim();
    if (
      sessionSubscriptionId &&
      trackedSubscriptionId &&
      sessionSubscriptionId !== trackedSubscriptionId
    ) {
      throw new Error("Checkout and subscription records did not agree.");
    }

    if (typeof session.subscription === "string") {
      await addSubscriptionById(stripe, found, sessionSubscriptionId, userId);
    } else if (session.subscription) {
      addSubscriptionObject(found, session.subscription, userId);
    }

    if (trackedSubscriptionId) {
      await addSubscriptionById(
        stripe,
        found,
        trackedSubscriptionId,
        userId
      );
    }

    if (session.status === "complete" && !sessionSubscriptionId && !trackedSubscriptionId) {
      throw new Error("A completed Checkout Session was missing its subscription.");
    }

    reconciledCheckoutSessionIds.push(checkoutSessionId);
  }

  let page;
  do {
    const result = await stripe.subscriptions.search({
      query: `metadata['user_id']:'${userId}'`,
      limit: 100,
      ...(page ? { page } : {})
    });
    for (const subscription of result.data || []) {
      assertSubscriptionOwner(subscription, userId);
      found.set(subscription.id, subscription);
    }
    page = result.has_more ? result.next_page : undefined;
    if (result.has_more && !page) {
      throw new Error("Stripe subscription pagination could not be completed.");
    }
  } while (page);

  return {
    subscriptions: [...found.values()],
    reconciledCheckoutSessionIds
  };
}
