// Included only by scripts/build-test.mjs, never by the production HTML.
const banner = document.createElement('aside');
banner.className = 'october-test-banner';
banner.setAttribute('aria-label', 'Test environment');
banner.textContent = 'TEST SITE — Use fictional data. Separate test accounts and database. Sample meal values only; live AI and payments are disabled.';
if (/\/test-lab(?:\.html)?$/.test(location.pathname)) banner.textContent = 'TEST SITE — Browser-only sample lab. Fixed fictional values; no AI, payments, or production access.';
document.body.prepend(banner);
if (/\/auth(?:\.html)?$/.test(location.pathname)) {
  const link = document.createElement('a');
  link.href = '/app/test-lab.html'; link.textContent = 'Try the sample lab without an account →';
  banner.append(document.createElement('br'), link);
}
document.title = `TEST — ${document.title}`;

if ('serviceWorker' in navigator) {
  for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
}

const quickEntry = document.querySelector('#quick-entry');
if (quickEntry) {
  const panel = document.createElement('details');
  panel.className = 'october-test-samples';
  const summary = document.createElement('summary');
  summary.textContent = 'Sample meals for calculation testing';
  panel.append(summary);
  const note = document.createElement('p');
  note.textContent = 'These fixed, fictional nutrition values test the software, not food accuracy. Choose a sample, then press Log. You can edit its percentage or switch to another sample.';
  panel.append(note);
  for (const description of ['Test pizza', '50% Test pizza', 'Test salad with dressing', 'Test salad without dressing', '1 oz test strawberry vinaigrette']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-quiet';
    button.textContent = description;
    button.addEventListener('click', () => {
      quickEntry.value = description;
      quickEntry.dispatchEvent(new Event('input', { bubbles: true }));
      quickEntry.focus();
    });
    panel.append(button);
  }
  quickEntry.closest('form').before(panel);
}
// Disable payment/AI-only affordances rather than presenting a live checkout.
for (const control of document.querySelectorAll('[data-plan], #reset-password')) {
  control.disabled = true;
  control.title = 'Unavailable in this isolated test environment';
}
