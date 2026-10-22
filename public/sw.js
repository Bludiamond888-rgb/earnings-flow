// Earnings Flow service worker. Bump VERSION on each release.
const VERSION = 'ef-v2';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './data/index.json', './data/tickers.json'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(CORE);
    try { await c.add('./data/universe.json'); } catch { /* universe not deployed: starter data only */ }
  }));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const put = r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; };
  if (u.pathname.includes('/data/')) {
    // data: network-first (fresh weekly numbers); every company you open is kept for offline use
    e.respondWith(fetch(e.request).then(put).catch(() => caches.match(e.request).then(r => r || new Response('offline', { status: 503 }))));
  } else if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(put).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
  } else {
    // hashed assets: cache-first
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(put)));
  }
});
