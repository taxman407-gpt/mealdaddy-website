// Keep Android/browser Back inside an unfinished planning workflow. No form is submitted.
export function guardPlanningBack({subview, parentView, navigate, save = () => {}}) {
  const marker = 'mealdaddyPlanningView';
  let token = null, active = true;
  const isOpen = () => document.body.dataset.appSubview === subview;
  function release() {
    if (token && history.state?.[marker] === token) {
      const state = {...history.state}; delete state[marker]; history.replaceState(state, '', location.href);
    }
    token = null;
  }
  const observer = new MutationObserver(() => {
    if (!active) return;
    if (isOpen() && !token) {
      token = `${subview}:${crypto.randomUUID()}`;
      try { history.pushState({...history.state, [marker]: token}, '', location.href); }
      catch { token = null; }
    } else if (!isOpen() && token) { save(); release(); }
  });
  observer.observe(document.body, {attributes: true, attributeFilter: ['data-app-view', 'data-app-subview']});
  const pop = event => {
    if (!active || !token || event.state?.[marker] === token) return;
    const wasOpen = isOpen(); token = null; save();
    if (wasOpen) navigate(parentView, '');
  };
  window.addEventListener('popstate', pop);
  return {dispose() { active = false; observer.disconnect(); window.removeEventListener('popstate', pop); release(); }};
}
