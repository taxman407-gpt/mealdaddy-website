// Server-only Stripe integration boundary. This file is excluded from static assets.
// Trials are granted per Checkout Session so the public client cannot bypass the cap.

const DEFAULT_WEEKLY_TRIAL_LIMIT = 2_000;
const DEFAULT_TRIAL_DAYS = 7;
const DEFAULT_TIME_ZONE = "America/New_York";

export function easternWeekStart(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    }).formatToParts(now).map(({ type, value }) => [type, value])
  );
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  const localMonday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  localMonday.setUTCDate(localMonday.getUTCDate() - ((weekdayIndex + 6) % 7));
  return localMonday.toISOString().slice(0, 10);
}

export class StripeBillingAdapter {
  constructor({
    secretKey,
    webhookSecret,
    priceIds = {},
    trialRepository,
    weeklyTrialLimit = DEFAULT_WEEKLY_TRIAL_LIMIT,
    trialDays = DEFAULT_TRIAL_DAYS,
    timeZone = DEFAULT_TIME_ZONE,
    fetchImpl = fetch,
    now = () => new Date()
  }) {
    this.secretKey = secretKey;
    this.webhookSecret = webhookSecret;
    this.priceIds = priceIds;
    this.trialRepository = trialRepository;
    this.weeklyTrialLimit = weeklyTrialLimit;
    this.trialDays = trialDays;
    this.timeZone = timeZone;
    this.fetch = fetchImpl;
    this.now = now;
  }

  get configured() {
    return Boolean(this.secretKey && this.webhookSecret && Object.keys(this.priceIds).length);
  }

  async getTrialAvailability() {
    this.#assertTrialRepository();
    const weekStart = easternWeekStart(this.now(), this.timeZone);
    const usedCount = await this.trialRepository.getWeeklyTrialCount(weekStart);
    return {
      available: usedCount < this.weeklyTrialLimit,
      weekStart,
      usedCount,
      weeklyLimit: this.weeklyTrialLimit,
      remaining: Math.max(0, this.weeklyTrialLimit - usedCount),
      trialDays: usedCount < this.weeklyTrialLimit ? this.trialDays : 0
    };
  }

  async createCheckoutSession({ userId, email, plan, successUrl, cancelUrl }) {
    this.#assertConfigured();
    this.#assertTrialRepository();
    const price = this.priceIds[plan];
    if (!price) throw new Error("Unknown subscription plan.");

    const weekStart = easternWeekStart(this.now(), this.timeZone);
    const reservation = await this.trialRepository.reserveWeeklyTrial({
      userId,
      weekStart,
      weeklyLimit: this.weeklyTrialLimit
    });
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      client_reference_id: userId,
      customer_email: email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "metadata[user_id]": userId,
      "metadata[trial_reservation_id]": reservation.reservationId || "none"
    });

    if (reservation.eligible) {
      body.set("subscription_data[trial_period_days]", String(this.trialDays));
      body.set("subscription_data[metadata][mealdaddy_trial_week]", weekStart);
      body.set("subscription_data[metadata][mealdaddy_trial_reservation]", reservation.reservationId);
    }

    try {
      const session = await this.#request("/v1/checkout/sessions", body);
      if (reservation.eligible) {
        await this.trialRepository.attachCheckoutSession(reservation.reservationId, session.id);
      }
      return { ...session, mealdaddyTrialGranted: reservation.eligible };
    } catch (error) {
      if (reservation.eligible) {
        await this.trialRepository.releaseTrialReservationById(reservation.reservationId).catch(() => {});
      }
      throw error;
    }
  }

  async markCheckoutCompleted(checkoutSessionId) {
    this.#assertTrialRepository();
    return this.trialRepository.markTrialGranted(checkoutSessionId);
  }

  async releaseExpiredCheckout(checkoutSessionId) {
    this.#assertTrialRepository();
    return this.trialRepository.releaseTrialReservation(checkoutSessionId);
  }

  async createPortalSession({ customerId, returnUrl }) {
    this.#assertConfigured();
    return this.#request("/v1/billing_portal/sessions", new URLSearchParams({ customer: customerId, return_url: returnUrl }));
  }

  async #request(path, body) {
    const response = await this.fetch(`https://api.stripe.com${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.secretKey}`, "content-type": "application/x-www-form-urlencoded" },
      body
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "Stripe request failed.");
    return payload;
  }

  #assertConfigured() {
    if (!this.configured) throw new Error("Stripe billing is not configured.");
  }

  #assertTrialRepository() {
    if (!this.trialRepository) throw new Error("Stripe trial repository is not configured.");
  }
}

export const BILLING_ENV_KEYS = Object.freeze([
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_MEAL_DADDY_CORE",
  "STRIPE_PRICE_BYO_API",
  "MEALDADDY_WEEKLY_TRIAL_LIMIT"
]);

export const TRIAL_POLICY_DEFAULTS = Object.freeze({
  weeklyLimit: DEFAULT_WEEKLY_TRIAL_LIMIT,
  trialDays: DEFAULT_TRIAL_DAYS,
  timeZone: DEFAULT_TIME_ZONE
});
