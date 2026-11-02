/* Pocket Arcade service worker: precache everything, serve cache-first so games load instantly and offline.
   Deploying a change? Run `python3 tools/build.py` (bumps BUILD and refreshes ASSETS), then upload. */
const BUILD = "9ebcfd510f";
const CACHE = 'pocket-arcade-' + BUILD;
const ASSETS = [
  "./",
  "css/arcade.css",
  "fonts/chakra-petch-latin-400-normal.woff2",
  "fonts/chakra-petch-latin-600-normal.woff2",
  "fonts/silkscreen-latin-400-normal.woff2",
  "fonts/silkscreen-latin-700-normal.woff2",
  "games.json",
  "games/cave-flyer/game.js",
  "games/order.txt",
  "games/sol-tycoon/game.js",
  "games/switchboard/game.js",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "js/core.js",
  "js/sync.js",
  "manifest.webmanifest"
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  // no skipWaiting here: the page shows an "Update" button and tells us when to switch
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('pocket-arcade-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return; // cloud sync and other APIs go straight to the network

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      return (await cache.match('index.html')) || fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: sameOrigin });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
