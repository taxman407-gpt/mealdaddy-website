export const sandboxProject = 'dkirmzthyynogkkaacmj';
export const sandboxOrigin = 'https://mealdaddy-october-test.taxman407.workers.dev';
const config = Object.freeze({
  APP_ORIGIN: sandboxOrigin,
  STRIPE_CORE_PRICE_ID: 'price_1TxzpVCVOk0M72MfW3qHZe2O',
  STRIPE_BYO_PRICE_ID: 'price_1TxzqGCVOk0M72MfxFVlLb2S',
  ENABLE_BYOK: 'true',
  ENABLE_LIFETIME_BILLING: 'false',
  ENABLE_REFERRALS: 'false',
  ENABLE_OWNER_CONVERSION_REPORT: 'false'
});
export function sandboxEnv(name, env = key => Deno.env.get(key)) {
  if (name === 'STRIPE_SECRET_KEY') return env('SANDBOX_STRIPE_SECRET_KEY');
  if (name === 'STRIPE_WEBHOOK_SECRET') return env('SANDBOX_STRIPE_WEBHOOK_SECRET');
  return Object.hasOwn(config, name) ? config[name] : env(name);
}
export function sandboxBillingError(env, origin = '') {
  if (env('SUPABASE_URL') !== `https://${sandboxProject}.supabase.co`) return 'Wrong sandbox project';
  if (!/^(sk|rk)_test_/.test(env('STRIPE_SECRET_KEY') || '')) return 'Sandbox Stripe credentials are not configured';
  if (origin && origin !== sandboxOrigin) return 'Sandbox origin required';
  return null;
}
export function sandboxServe(handler) {
  Deno.serve(request => {
    const error = sandboxBillingError(sandboxEnv, request.headers.get('origin') || '');
    if (error) return Response.json({error}, {status:503});
    return handler(request);
  });
}
