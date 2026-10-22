/** One temporary history entry lets browser/Android Back close an unfinished editor. */
export function createDraftNavigation({ history = globalThis.history, events = globalThis, location = globalThis.location } = {}) {
  let active = null;
  let sequence = 0;
  const field = 'mealdaddyDraftView';
  function open(key, onLeave) {
    if (active?.key === key) return;
    if (active) active.onLeave();
    const token = `${Date.now()}:${++sequence}:${key}`;
    const nextState = { ...(history.state || {}), [field]: token };
    try {
      // Reuse our temporary entry when moving between editors or after reload.
      if (history.state?.[field]) history.replaceState(nextState, '', location.href);
      else history.pushState(nextState, '', location.href);
      active = { key, token, onLeave };
    } catch {
      active = null; // Normal navigation still triggers the pagehide draft backup.
    }
  }
  function close(key) {
    if (active?.key !== key) return;
    const token = active.token;
    active = null;
    if (history.state?.[field] === token) history.back();
  }
  function onPop(event) {
    if (!active || event.state?.[field] === active.token) return;
    const leaving = active;
    active = null;
    leaving.onLeave();
  }
  events.addEventListener('popstate', onPop);
  return { open, close, dispose() { events.removeEventListener('popstate', onPop); active = null; } };
}
