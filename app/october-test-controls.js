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

// Disable payment/AI-only affordances rather than presenting a live checkout.
for (const control of document.querySelectorAll('[data-plan]')) {
  control.disabled = true;
  control.title = 'Unavailable in this isolated test environment';
}
