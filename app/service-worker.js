const CACHE = "mealdaddy-shell-v97";
const SHELL = ["./referrals.js?v=20261022-1", "./referral-client.js?v=20261022-1", "./membership-policy.mjs?v=20261022-1", "./byok-vault.js?v=20261022-1", "./draft-navigation.js?v=20261022-1", "./photo-review.js?v=20261022-1", "./meal-drafts.js?v=20261021-1", "./meal-portion.js?v=20261021-1", "./", "./index.html", "./auth.html", "./app.html", "./account.html", "./setup.html", "./styles.css?v=20261023-1", "./auth.js?v=20261004-1", "./app.js?v=20261022-1", "./account.js?v=20261008-1", "./setup.js?v=20261004-8", "./entry-date.js?v=20260813-4", "./feedback-guidance.js?v=20261004-1", "./adaptive-hydration.js?v=20261004-1", "./health-metrics.js?v=20260929-1", "./favorite-meal.js?v=20261004-1", "./inflammation-impact.js?v=20261004-4", "./metric-progress.js?v=20260930-1", "./metric-order.js?v=20261004-3", "./profile-preferences.js?v=20260929-1", "./saved-foods.js?v=20261004-11", "./saved-foods-store.js?v=20260929-1", "./restaurant-plan.js?v=20261004-1", "./private-image.js?v=20261004-1", "./supabase-client.js?v=20261004-1", "./vendor/supabase-js.js?v=20260813-4", "./entry-reliability.js?v=20261016-1", "./entry-reliability.css?v=20261016-1", "./account-owner-tools.js?v=20261008-1"];

self.addEventListener("install", (event) => {
  // Reload known public shell assets so an old HTTP cache cannot pin a repair out.
  const requests = SHELL.map((path) => new Request(new URL(path, self.location.href), { cache: "reload" }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
