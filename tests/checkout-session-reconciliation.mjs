import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcileCheckoutSessionsForDeletion } from "../supabase/functions/_shared/checkout-reconciliation.mjs";

function stripeMock({ sessions = {}, subscriptions = {}, searchResults = [] } = {}) {
  const calls = { expired: [], subscriptionRetrievals: [], searches: 0 };
  return {
    calls,
    checkout: {
      sessions: {
        async retrieve(id) {
          if (!sessions[id]) throw new Error(`Missing Checkout Session ${id}`);
          return structuredClone(sessions[id]);
        },
        async expire(id) {
          if (!sessions[id]) throw new Error(`Missing Checkout Session ${id}`);
          calls.expired.push(id);
          sessions[id] = { ...sessions[id], status: "expired" };
          return structuredClone(sessions[id]);
        }
      }
    },
    subscriptions: {
      async retrieve(id) {
        calls.subscriptionRetrievals.push(id);
        if (!subscriptions[id]) throw new Error(`Missing subscription ${id}`);
        return structuredClone(subscriptions[id]);
      },
      async search() {
        const result = searchResults[calls.searches] ?? { data: [], has_more: false };
        calls.searches += 1;
        return structuredClone(result);
      }
    }
  };
}

const userId = "11111111-1111-4111-8111-111111111111";

{
  const stripe = stripeMock({
    sessions: {
      cs_completed_before_webhook: {
        id: "cs_completed_before_webhook",
        mode: "subscription",
        status: "complete",
        client_reference_id: userId,
        metadata: { user_id: userId },
        subscription: "sub_direct"
      }
    },
    subscriptions: {
      sub_direct: { id: "sub_direct", status: "active", metadata: { user_id: userId } }
    }
  });
  const result = await reconcileCheckoutSessionsForDeletion({
    stripe,
    userId,
    checkoutSessions: [{
      checkout_session_id: "cs_completed_before_webhook",
      stripe_subscription_id: null
    }]
  });
  assert.deepEqual(result.reconciledCheckoutSessionIds, ["cs_completed_before_webhook"]);
  assert.deepEqual(result.subscriptions.map(({ id }) => id), ["sub_direct"]);
  assert.deepEqual(stripe.calls.subscriptionRetrievals, ["sub_direct"]);
  assert.equal(stripe.calls.searches, 1, "Direct reconciliation must work even while Stripe Search is empty.");
}

{
  const stripe = stripeMock({
    sessions: {
      cs_tracked_subscription: {
        id: "cs_tracked_subscription",
        mode: "subscription",
        status: "complete",
        client_reference_id: userId,
        metadata: { user_id: userId },
        subscription: null
      }
    },
    subscriptions: {
      sub_tracked: { id: "sub_tracked", status: "trialing", metadata: { user_id: userId } }
    }
  });
  const result = await reconcileCheckoutSessionsForDeletion({
    stripe,
    userId,
    checkoutSessions: [{
      checkout_session_id: "cs_tracked_subscription",
      stripe_subscription_id: "sub_tracked"
    }]
  });
  assert.deepEqual(result.subscriptions.map(({ id }) => id), ["sub_tracked"]);
  assert.deepEqual(stripe.calls.subscriptionRetrievals, ["sub_tracked"]);
}

{
  const stripe = stripeMock({
    sessions: {
      cs_open: {
        id: "cs_open",
        mode: "subscription",
        status: "open",
        client_reference_id: userId,
        metadata: { user_id: userId },
        subscription: null
      }
    }
  });
  const result = await reconcileCheckoutSessionsForDeletion({
    stripe,
    userId,
    checkoutSessions: [{ checkout_session_id: "cs_open", stripe_subscription_id: null }]
  });
  assert.deepEqual(stripe.calls.expired, ["cs_open"]);
  assert.deepEqual(result.reconciledCheckoutSessionIds, ["cs_open"]);
}

{
  const stripe = stripeMock({
    sessions: {
      cs_completed_without_subscription: {
        id: "cs_completed_without_subscription",
        mode: "subscription",
        status: "complete",
        client_reference_id: userId,
        metadata: { user_id: userId },
        subscription: null
      }
    }
  });
  await assert.rejects(
    reconcileCheckoutSessionsForDeletion({
      stripe,
      userId,
      checkoutSessions: [{
        checkout_session_id: "cs_completed_without_subscription",
        stripe_subscription_id: null
      }]
    }),
    /missing its subscription/i,
    "A completed but unresolved checkout must block deletion."
  );
}

{
  const stripe = stripeMock({
    sessions: {
      cs_conflicting_subscription: {
        id: "cs_conflicting_subscription",
        mode: "subscription",
        status: "complete",
        client_reference_id: userId,
        metadata: { user_id: userId },
        subscription: "sub_from_stripe"
      }
    },
    subscriptions: {
      sub_from_stripe: { id: "sub_from_stripe", status: "active", metadata: { user_id: userId } },
      sub_from_database: { id: "sub_from_database", status: "active", metadata: { user_id: userId } }
    }
  });
  await assert.rejects(
    reconcileCheckoutSessionsForDeletion({
      stripe,
      userId,
      checkoutSessions: [{
        checkout_session_id: "cs_conflicting_subscription",
        stripe_subscription_id: "sub_from_database"
      }]
    }),
    /did not agree/i,
    "Conflicting durable and live subscription IDs must block deletion."
  );
}

{
  const stripe = stripeMock({
    sessions: {
      cs_wrong_owner: {
        id: "cs_wrong_owner",
        mode: "subscription",
        status: "expired",
        client_reference_id: "22222222-2222-4222-8222-222222222222",
        metadata: {},
        subscription: null
      }
    }
  });
  await assert.rejects(
    reconcileCheckoutSessionsForDeletion({
      stripe,
      userId,
      checkoutSessions: [{ checkout_session_id: "cs_wrong_owner", stripe_subscription_id: null }]
    }),
    /could not be matched/i
  );
}

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261005030000_checkout_session_reconciliation.sql");
const checkout = read("supabase/functions/create-checkout/index.ts");
const deletion = read("supabase/functions/delete-account/index.ts");
const webhook = read("supabase/functions/stripe-webhook/index.ts");

assert.match(migration, /create table if not exists public\.stripe_checkout_sessions/i);
assert.match(migration, /references auth\.users\(id\) on delete restrict/i);
assert.match(migration, /alter table public\.stripe_checkout_sessions enable row level security/i);
assert.match(migration, /revoke all on table public\.stripe_checkout_sessions from public, anon, authenticated/i);
assert.match(migration, /from public\.subscription_trial_reservations/i);

const createIndex = checkout.indexOf("checkout.sessions.create(");
const persistIndex = checkout.indexOf('.from("stripe_checkout_sessions")', createIndex);
const returnIndex = checkout.indexOf("return json({ url: session.url", persistIndex);
assert.ok(createIndex >= 0 && persistIndex > createIndex && returnIndex > persistIndex);
assert.match(checkout, /if \(checkoutTrackingError\)[\s\S]*checkout\.sessions\.expire\(session\.id\)/);

const reconcileIndex = deletion.indexOf("await reconcileCheckoutSessionsForDeletion(");
const exactDeleteIndex = deletion.indexOf('.in("checkout_session_id", checkoutSessionIds)', reconcileIndex);
const userDeleteIndex = deletion.indexOf("admin.auth.admin.deleteUser(user.id)", exactDeleteIndex);
assert.ok(reconcileIndex >= 0 && exactDeleteIndex > reconcileIndex && userDeleteIndex > exactDeleteIndex);
assert.match(deletion, /removedSessions\?\.length !== checkoutSessionIds\.length/);
assert.doesNotMatch(
  deletion,
  /from\("stripe_checkout_sessions"\)[\s\S]{0,160}\.delete\(\)[\s\S]{0,160}\.eq\("user_id", user\.id\)(?![\s\S]{0,120}\.in\("checkout_session_id")/,
  "Deletion must never broadly remove session rows that may have appeared after reconciliation."
);

assert.match(webhook, /checkout\.session\.completed[\s\S]*from\("stripe_checkout_sessions"\)/);
assert.match(webhook, /checkout\.session\.expired[\s\S]*from\("stripe_checkout_sessions"\)/);

console.log("Checkout-session reconciliation checks passed.");
