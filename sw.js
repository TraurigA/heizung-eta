// Heizungs-Logbuch Service Worker (v3.3.3)
const VERSION = "3.3.3";
const CACHE = `heizlog-cache-${VERSION}`;

// Minimal app shell. We avoid over-caching API calls.
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

function isAppShell(req){
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return false;
  // treat navigation and core assets as app shell
  if(req.mode === "navigate") return true;
  return ASSETS.some(a => url.pathname.endsWith(a.replace("./","/")));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // App shell: network-first (so updates show quickly), fallback to cache.
  if(isAppShell(req)){
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try{
        const fresh = await fetch(req);
        if(fresh && fresh.ok){
          cache.put(req, fresh.clone());
        }
        return fresh;
      }catch(_){
        const hit = await cache.match(req);
        return hit || caches.match("./index.html");
      }
    })());
    return;
  }

  // Everything else: default
});
