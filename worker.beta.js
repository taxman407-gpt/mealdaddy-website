const host='mealdaddy-october-test.taxman407.workers.dev';
const api='https://egbieqvbwniaxgqjzqkp.supabase.co';
const headers={'X-MealDaddy-Test-Release':'private-beta-v1','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: ${api}; media-src 'self' blob:; connect-src 'self' ${api} ${api.replace('https:','wss:')}; script-src 'self'; style-src 'self'; worker-src 'self' blob:`};
function secure(response){const result=new Response(response.body,response);for(const [key,value] of Object.entries(headers))result.headers.set(key,value);return result;}
export default{async fetch(request,env){
 const url=new URL(request.url);
 if(url.hostname!==host&&!['localhost','127.0.0.1'].includes(url.hostname))return secure(new Response('Beta host only',{status:421}));
 if(!['GET','HEAD'].includes(request.method))return secure(new Response('Method not allowed',{status:405}));
 if(url.pathname==='/health')return secure(Response.json({environment:'private-beta',accounts:'shared',billing:'disabled',apiNamespace:'beta-',providerReadiness:'requires-credentials'}));
 if(url.pathname==='/')return secure(Response.redirect(new URL('/app/auth.html',url),302));
 if(!/^\/(?:app\/|assets\/|(?:privacy|terms|health-disclaimer)\.html$)/.test(url.pathname)||url.pathname.includes('..')||url.pathname.endsWith('.map'))return secure(new Response('Not found',{status:404}));
 if(!env?.ASSETS)return secure(new Response('Beta assets unavailable',{status:503}));
 return secure(await env.ASSETS.fetch(request));
}};
