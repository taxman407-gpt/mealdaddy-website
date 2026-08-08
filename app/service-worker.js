const CACHE = "mealdaddy-shell-v38";
const SHELL = ["./", "./index.html", "./auth.html", "./app.html", "./account.html", "./setup.html", "./styles.css?v=20260808-5", "./auth.js?v=20260729-22", "./app.js?v=20260808-5", "./account.js?v=20260808-5", "./setup.js?v=20260808-5", "./feedback-guidance.js?v=20260808-5", "./health-metrics.js?v=20260808-5", "./saved-foods.js?v=20260808-5", "./saved-foods-store.js?v=20260808-5", "./supabase-client.js"];

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
