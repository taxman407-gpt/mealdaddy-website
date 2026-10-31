// Deliberately no raw errors, request/response content, URLs, device IDs or AI keys.
export const DIAGNOSTIC_VERSION = '20261031';
const features = new Set(['estimate-entry','analyze-saved-food','adjust-leftovers','coach-action','recipe-recreation']);
export function diagnosticEvent(feature, elapsedMs, failed) {
  if (!features.has(feature) || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  return {feature, outcome: failed ? 'failure' : 'success',
    duration_band: elapsedMs < 5000 ? 'under_5s' : elapsedMs < 20000 ? '5_to_20s' : elapsedMs < 60000 ? '20_to_60s' : 'over_60s',
    app_version: DIAGNOSTIC_VERSION};
}
export function createOptionalDiagnostics(client) {
  return async (feature, elapsedMs, failed) => {
    const event = diagnosticEvent(feature, elapsedMs, failed);
    if (!event) return;
    try {
      const {data: {session}} = await client.auth.getSession();
      if (!session?.user?.id) return;
      const userId = session.user.id;
      // Recheck server consent each time; no queue or stale cached permission.
      const {data, error} = await client.from('diagnostic_preferences').select('enabled').eq('user_id',userId).maybeSingle();
      if (error || data?.enabled !== true) return;
      await client.from('optional_diagnostic_events').insert({...event,user_id:userId});
    } catch { /* Optional reporting must never interrupt a member action. */ }
  };
}
export async function initializeDiagnosticsControl({client,userId,root=document}) {
  const checkbox=root.querySelector('#optional-diagnostics'),status=root.querySelector('#diagnostics-status');
  if(!checkbox||!status)return;
  checkbox.disabled=true;checkbox.checked=false;
  const {data,error}=await client.from('diagnostic_preferences').select('enabled').eq('user_id',userId).maybeSingle();
  if(error){status.textContent='Optional diagnostics are unavailable. No optional reports will be sent from this control.';return;}
  checkbox.checked=data?.enabled===true;checkbox.disabled=false;
  status.textContent=checkbox.checked?'Optional diagnostics are on.':'Optional diagnostics are off.';
  checkbox.addEventListener('change',async()=>{
    const enabled=checkbox.checked;checkbox.disabled=true;
    try {
      const {error}=await client.from('diagnostic_preferences').upsert({user_id:userId,enabled,consent_version:1,updated_at:new Date().toISOString()},{onConflict:'user_id'});
      if(error)throw error;
      status.textContent=enabled?'Optional diagnostics are on.':'Optional diagnostics are off. Future optional reports will not be sent.';
    }catch{checkbox.checked=!enabled;status.textContent='Your choice could not be saved. The previous setting is still active; please retry.';}
    finally{checkbox.disabled=false;}
  });
}
