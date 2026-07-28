// Server-only Stripe integration boundary. This file is excluded from static assets.
// It becomes active only after Stripe account ownership, products, prices, and secrets are configured.

export class StripeBillingAdapter {
  constructor({ secretKey, webhookSecret, priceIds = {}, fetchImpl = fetch }) {
    this.secretKey = secretKey;
    this.webhookSecret = webhookSecret;
    this.priceIds = priceIds;
    this.fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.secretKey && this.webhookSecret && Object.keys(this.priceIds).length);
  }

  async createCheckoutSession({ userId, email, plan, successUrl, cancelUrl }) {
    this.#assertConfigured();
    const price = this.priceIds[plan];
    if (!price) throw new Error("Unknown subscription plan.");

    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      client_reference_id: userId,
      customer_email: email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "metadata[user_id]": userId
    });

    return this.#request("/v1/checkout/sessions", body);
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
}

export const BILLING_ENV_KEYS = Object.freeze([
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STANDARD",
  "STRIPE_PRICE_PLUS"
]);
