/* ══════════════════════════════════════════════════════════
   RANA AHMAD MILK SHOP — Service Worker
   Makes the app installable + fully offline (real-APK feel).
   Bump CACHE_VERSION whenever RAMSAPP.HTML changes.
══════════════════════════════════════════════════════════ */
const CACHE_VERSION = 'rams-v5';
const APP_SHELL = [
  './',
  'RAMSAPP.HTML',
  'manifest.json',
  'splash.mp4',
  'logo.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'favicon-64.png'
];
/* Third-party libraries the app depends on — precached so the very
   first offline launch already works. */
const VENDOR = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // App shell must all succeed.
    await cache.addAll(APP_SHELL);
    // Vendor files are best-effort (won't block install if a CDN hiccups).
    await Promise.allSettled(
      VENDOR.map((u) => cache.add(new Request(u, { mode: 'no-cors' })).catch(() => {}))
    );
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Navigations: network-first, fall back to cached app shell (offline).
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('RAMSAPP.HTML', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('RAMSAPP.HTML')) ||
               (await caches.match('./')) ||
               new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Everything else: cache-first, then network (and cache the result).
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreVary: true });
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && (fresh.ok || fresh.type === 'opaque')) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      return cached || new Response('', { status: 504 });
    }
  })());
});
