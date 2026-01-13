// sw.js – Heizungs-Logbuch (v3.2.1)
// Strategy:
// - HTML/JS/JSON: network-first (updates arrive quickly)
// - Images/icons: cache-first
// Plus: skipWaiting + clientsClaim + cache cleanup

const CACHE = "heizlog-cache-v3.2.1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./config.js",
  "./app.js",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  const isDoc = req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith(".html");
  const isCode = url.pathname.endsWith(".js") || url.pathname.endsWith(".json");

  if (isDoc || isCode) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const hit = await caches.match(req);
        return hit || caches.match("./index.html");
      }
    })());
    return;
  }

  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
