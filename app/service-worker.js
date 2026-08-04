const CACHE = "mealdaddy-shell-v25";
const SHELL = ["./", "./index.html", "./auth.html", "./app.html", "./account.html", "./styles.css?v=20260804-25", "./auth.js?v=20260729-22", "./app.js?v=20260804-25", "./account.js?v=20260729-22", "./feedback-guidance.js?v=20260804-25", "./supabase-client.js"];

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
