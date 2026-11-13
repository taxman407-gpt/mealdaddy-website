// Beta-only UI helpers. No account writes, automatic provider changes or AI calls.
export const AI_SETUP_CODE = 'AI_SETUP_REQUIRED';
export function aiSetupError(message = 'Choose an AI provider to calculate nutrition.') {
  return Object.assign(new Error(message), {code: AI_SETUP_CODE, status: 422,
    context: new Response(JSON.stringify({error: message, code: AI_SETUP_CODE}), {status: 422})});
}
export function isAiSetupError(error) {
  return error?.code === AI_SETUP_CODE || /choose (your beta AI connection|an AI provider)|connect your selected (BYOK|account provider)/i.test(error?.message || '');
}
export function initializePriorityOneUI({navigate, getSource}) {
  const style = document.createElement('link'); style.rel = 'stylesheet';
  style.href = new URL('./priority-one.css', import.meta.url).href; document.head.append(style);
  document.body.classList.add('priority-one');
  const dashboard = document.querySelector('.dashboard');
  const toast = document.querySelector('#toast');
  // In-flow, not an overlay: it cannot cover the action named in its message.
  if (toast && dashboard) { dashboard.before(toast); toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); }
  const notice = document.createElement('section'); notice.id = 'ai-setup-notice';
  notice.className = 'ai-setup-notice'; notice.hidden = true;
  notice.innerHTML = '<p role="status" aria-live="polite"></p><div class="p1-actions"><button type="button" data-open-ai-settings>Open AI Settings</button><button type="button" data-return-from-ai-settings hidden>Back to my work</button></div>';
  dashboard?.before(notice);
  let returnView = null;
  const message = notice.querySelector('p');
  const back = notice.querySelector('[data-return-from-ai-settings]');
  function show(error) {
    notice.hidden = false;
    message.textContent = `${error?.message || 'Choose an AI provider to calculate nutrition.'} Your saved entries and unfinished work are kept. No alternate provider is selected automatically.`;
  }
  function openSettings() {
    if (document.body.dataset.appSubview !== 'ai-settings') {
      returnView = {view: document.body.dataset.appView || 'log', subview: document.body.dataset.appSubview || ''};
    }
    navigate('more', 'ai-settings'); notice.hidden = false; back.hidden = !returnView;
    message.textContent = 'Choose your AI connection below, then return to your work. Retry the existing entry; do not log it again.';
    requestAnimationFrame(() => {
      const control = document.querySelector('#beta-source') || document.querySelector('#byok-provider');
      control?.scrollIntoView({block: 'center'}); control?.focus({preventScroll: true});
    });
  }
  function refresh() {
    if (!getSource()) { show(aiSetupError()); return; }
    if (returnView) {
      message.textContent = 'Connection selected. Return to your work and retry the existing entry. Selecting a connection does not itself run an estimate.';
      back.hidden = false;
    } else notice.hidden = true;
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-open-ai-settings]')) { event.preventDefault(); openSettings(); }
    if (event.target.closest('[data-return-from-ai-settings]') && returnView) {
      const target = returnView; returnView = null; back.hidden = true; navigate(target.view, target.subview); refresh();
    }
  });
  document.addEventListener('change', event => { if (event.target.id === 'beta-source') queueMicrotask(refresh); });
  window.addEventListener('storage', event => { if (event.key?.startsWith('mealdaddy-beta-source:')) refresh(); });
  const more = document.querySelector('[aria-labelledby="more-tools-title"] .v1-launcher-list');
  if (more && !more.querySelector('[data-open-ai-settings]')) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.openAiSettings = '';
    button.innerHTML = '<span aria-hidden="true">AI</span><span><strong>AI Settings</strong><small>Choose or change your AI connection</small></span>';
    more.append(button);
  }
  refresh();
  return {show, openSettings, refresh};
}
