const release = "20261004-v95";

const privatePathPrefixes = [
  "/docs/",
  "/tests/",
  "/scripts/",
  "/supabase/",
  "/server/",
  "/api/",
  "/dist/",
  "/assets/design-reference/",
  "/.git",
  "/.github",
  "/.wrangler"
];

const privateRootFiles = new Set([
  "/.assetsignore",
  "/.env",
  "/.env.example",
  "/.gitignore",
  "/AI_TEAM.md",
  "/LAUNCH_RUNBOOK.md",
  "/README.md",
  "/netlify.toml",
  "/package.json",
  "/package-lock.json",
  "/pnpm-lock.yaml",
  "/pnpm-workspace.yaml",
  "/wrangler.jsonc",
  "/yarn.lock"
]);

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://egbieqvbwniaxgqjzqkp.supabase.co wss://egbieqvbwniaxgqjzqkp.supabase.co; script-src 'self'; style-src 'self'; manifest-src 'self'; worker-src 'self' blob:",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self)",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
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
    if (privateRootFiles.has(url.pathname) || privatePathPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
      return secured(new Response("Not found", { status: 404 }));
    }
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
