const CACHE = "mealdaddy-shell-v45";
const SHELL = ["./", "./index.html", "./auth.html", "./app.html", "./account.html", "./setup.html", "./styles.css?v=20260811-2", "./auth.js?v=20260811-2", "./app.js?v=20260811-2", "./account.js?v=20260811-2", "./setup.js?v=20260811-2", "./entry-date.js?v=20260811-2", "./feedback-guidance.js?v=20260811-2", "./health-metrics.js?v=20260811-2", "./favorite-meal.js?v=20260811-2", "./inflammation-impact.js?v=20260811-2", "./saved-foods.js?v=20260811-2", "./saved-foods-store.js?v=20260811-2", "./restaurant-plan.js?v=20260811-2", "./supabase-client.js?v=20260811-2"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
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
