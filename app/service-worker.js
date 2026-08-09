const CACHE = "mealdaddy-shell-v40";
const SHELL = ["./", "./index.html", "./auth.html", "./app.html", "./account.html", "./setup.html", "./styles.css?v=20260808-7", "./auth.js?v=20260808-7", "./app.js?v=20260808-7", "./account.js?v=20260808-7", "./setup.js?v=20260808-7", "./feedback-guidance.js?v=20260808-7", "./health-metrics.js?v=20260808-7", "./saved-foods.js?v=20260808-7", "./saved-foods-store.js?v=20260808-7", "./supabase-client.js?v=20260808-7"];

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
