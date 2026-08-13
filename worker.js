const release = "20260813-3";

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://egbieqvbwniaxgqjzqkp.supabase.co wss://egbieqvbwniaxgqjzqkp.supabase.co; script-src 'self'; style-src 'self'; manifest-src 'self'; worker-src 'self' blob:",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self)",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

function secured(response) {
  const copy = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders)) copy.headers.set(name, value);
  return copy;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isAppEntry =
      request.method === "GET" &&
      (url.pathname === "/app/app" || url.pathname === "/app/app.html");

    if (isAppEntry && url.searchParams.get("release") !== release) {
      url.searchParams.set("release", release);
      return secured(Response.redirect(url.toString(), 302));
    }

    return secured(await env.ASSETS.fetch(request));
  }
};
