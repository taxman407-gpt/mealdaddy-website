import { createClient } from 'npm:@supabase/supabase-js@2.54.0';
import { fixtureEstimate, fixtureDescriptions } from './fixtures.mjs';
import { unchangedEntryUpdate } from '../../functions/_shared/estimate-edit-contract.mjs';
const testUrl = 'https://dkirmzthyynogkkaacmj.supabase.co';
const cors = { 'Access-Control-Allow-Origin': 'https://mealdaddy-october-test.taxman407.workers.dev', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: cors }); }
Deno.serve(async (req: Request) => {
  if (Deno.env.get('SUPABASE_URL') !== testUrl) return json({ error: 'Test project only.' }, 503);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Authentication required.' }, 401);
  const client = createClient(testUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: authError } = await client.auth.getUser(authorization.slice(7));
  if (authError || !data.user) return json({ error: 'Authentication required.' }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (typeof body.entryId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.entryId)) return json({ error: 'Entry ID required.' }, 400);
  const { data: entry, error } = await client.from('ledger_entries').select('id,user_id,description,kind,status,nutrition_estimate').eq('id', body.entryId).eq('user_id', data.user.id).maybeSingle();
  if (error) return json({ error: 'Entry access denied or unavailable.' }, 403);
  if (!entry) return json({ error: 'Entry not found.' }, 404);
  if (entry.nutrition_estimate?.photo_path) return json({ error: 'Photo analysis is not connected in this test environment. Use a sample text meal.' }, 422);
  let estimate;
  try { estimate = fixtureEstimate(entry.description); } catch { return json({ error: 'Invalid sample portion.' }, 400); }
  if (!estimate || entry.kind !== 'meal') return json({ error: `Live AI is disabled. Supported sample meals: ${fixtureDescriptions.join('; ')}. A leading percentage is supported.` }, 422);
  const retained = Object.fromEntries(['input_authority','edit_revision','favorite_origin'].filter(key => key in (entry.nutrition_estimate || {})).map(key => [key, entry.nutrition_estimate[key]]));
  estimate = { ...estimate, ...retained };
  const saved = await unchangedEntryUpdate(client, data.user.id, entry, { nutrition_estimate: estimate, status: 'estimated' });
  if (saved.error) return json({ error: 'Sample calculation could not be saved.' }, 500);
  if (!saved.data) return json({ error: 'Entry changed; retry the latest saved edit.', code: 'ENTRY_CHANGED' }, 409);
  return json({ ok: true, estimate, fixture: true, environment: 'october-test' });
});
