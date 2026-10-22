import config from './test-environment.json' with { type: 'json' };
const headers = {
  'X-MealDaddy-Test-Release': 'october-lab-v1', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ${config.supabaseUrl} ${config.supabaseUrl.replace('https:', 'wss:')}; script-src 'self'; style-src 'self'; worker-src 'self' blob:`,
};
function secure(response) {
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
  return result;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== config.host && !['localhost', '127.0.0.1'].includes(url.hostname)) return secure(new Response('Test host only', { status: 421 }));
    if (url.pathname === '/health') return secure(Response.json({ environment: config.environment, projectRef: config.projectRef, productionConnected: false, ai: 'sample-fixtures-only', billing: 'disabled' }));
    if (url.pathname === '/') return secure(Response.redirect(new URL('/app/test-lab.html', url), 302));
    if (!['GET', 'HEAD'].includes(request.method)) return secure(new Response('Method not allowed', { status: 405 }));
    if (!/^\/(?:app\/|assets\/|(?:privacy|terms|health-disclaimer)\.html$)/.test(url.pathname) || url.pathname.includes('..') || url.pathname.endsWith('.map')) return secure(new Response('Not found', { status: 404 }));
    if (!env?.ASSETS) return secure(new Response('Isolated test assets are unavailable.', { status: 503 }));
    return secure(await env.ASSETS.fetch(request));
  }
};
