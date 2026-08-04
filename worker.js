const release = "20260804-27";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isAppEntry =
      request.method === "GET" &&
      (url.pathname === "/app/app" || url.pathname === "/app/app.html");

    if (isAppEntry && url.searchParams.get("release") !== release) {
      url.searchParams.set("release", release);
      return Response.redirect(url.toString(), 302);
    }

    return env.ASSETS.fetch(request);
  }
};
