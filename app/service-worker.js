const CACHE = "mealdaddy-shell-v19";
const SHELL = ["./", "./index.html", "./auth.html", "./app.html", "./account.html", "./styles.css?v=20260729-19", "./auth.js?v=20260729-19", "./app.js?v=20260729-19", "./account.js?v=20260729-19", "./supabase-client.js"];

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
