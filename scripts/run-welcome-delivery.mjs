import { pathToFileURL } from 'node:url';

const projects = new Set(['egbieqvbwniaxgqjzqkp', 'dkirmzthyynogkkaacmj']);
export async function runWelcomeDelivery({enabled = false, project, serviceKey, fetchImpl = fetch, limit = 5} = {}) {
  if (!enabled) return {enabled: false, processed: 0};
  if (!projects.has(project) || typeof serviceKey !== 'string' || !serviceKey.trim()) throw Error('Welcome scheduler configuration is incomplete.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw Error('Welcome scheduler batch must contain 1–5 requests.');
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    let response;
    try {
      response = await fetchImpl(`https://${project}.supabase.co/functions/v1/process-welcome-email`, {
        method: 'POST', redirect: 'error', headers: {...(serviceKey.startsWith('sb_secret_') ? {apikey: serviceKey} : {authorization: `Bearer ${serviceKey}`}), 'content-type': 'application/json'},
        body: '{}', signal: AbortSignal.timeout(30000)
      });
    } catch { throw Error('Welcome worker request failed; delivery state must be checked before retrying manually.'); }
    if (!response.ok) throw Error(`Welcome worker returned HTTP ${response.status}; inspect owner delivery status. No immediate retry was made.`);
    let result;
    try { result = await response.json(); } catch { throw Error('Welcome worker returned an invalid response.'); }
    if (result?.ok !== true) throw Error('Welcome worker did not confirm success.');
    if (result.enabled === false) return {enabled: false, processed};
    if (result.processed === 0) return {enabled: true, processed};
    if (result.processed !== 1) throw Error('Welcome worker returned an invalid delivery count.');
    processed++;
  }
  return {enabled: true, processed, batchLimitReached: true};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runWelcomeDelivery({enabled: process.env.WELCOME_EMAIL_SCHEDULER_ENABLED === 'true', project: process.env.WELCOME_PROJECT_REF, serviceKey: process.env.WELCOME_SERVICE_ROLE_KEY})));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
