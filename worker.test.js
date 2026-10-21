// Isolated preview gate. Intentionally does not serve the production application
// until its Supabase, Stripe, and AI endpoints are verified as test-only.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ environment: "mealdaddy-october-test", status: "ready-for-wiring", productionConnected: false }, { headers: { "Cache-Control": "no-store" } });
    }
    return new Response("MealDaddy test preview is not yet connected. Production services are intentionally disabled.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }
    });
  }
};
