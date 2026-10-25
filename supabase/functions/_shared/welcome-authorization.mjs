// Authenticate before flags, database access, or provider calls. Never trust decoded JWT claims.
export function welcomeServiceKey(headers, env) {
 const legacy = env.get('SUPABASE_SERVICE_ROLE_KEY');
 if (legacy && headers.get('authorization') === `Bearer ${legacy}`) return legacy;
 const supplied = headers.get('apikey');
 if (!supplied || !supplied.startsWith('sb_secret_')) return null;
 try {
  const configured = JSON.parse(env.get('SUPABASE_SECRET_KEYS') || '{}');
  if (!configured || Array.isArray(configured) || typeof configured !== 'object') return null;
  for (const key of Object.values(configured)) {
   if (typeof key !== 'string' || !key.startsWith('sb_secret_') || key.length !== supplied.length) continue;
   let diff = 0;
   for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ supplied.charCodeAt(i);
   if (diff === 0) return key;
  }
 } catch { /* Malformed configuration fails closed. */ }
 return null;
}
