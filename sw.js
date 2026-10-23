/* ══════════════════════════════════════════════════════════
   RANA AHMAD MILK SHOP — Service Worker
   Makes the app installable + fully offline (real-APK feel).
   Bump CACHE_VERSION whenever index.html changes, otherwise installed
   copies keep serving the old build from cache.
══════════════════════════════════════════════════════════ */
const CACHE_VERSION = 'rams-v22';
const APP_SHELL = [
  './',
  'index.html',       // the actual app — RAMSAPP.HTML only redirects here
  'RAMSAPP.HTML',
  'manifest.json',
  'inter.woff2',      // the app font (v19)
  'logo.png',         // opening animation
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
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-brands-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
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

  // Manual "force update" from the app's settings. Deletes only the HTTP
  // response caches — the ledger lives in localStorage and is untouched.
  if (e.data === 'CLEAR_CACHES') {
    e.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.postMessage('CACHES_CLEARED'));
    })());
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Navigations (v19): open from the phone at once, refresh in the background.
  // The old network-first rule made every launch wait for GitHub before the
  // app could appear. Now the saved copy opens instantly and a fresh copy is
  // fetched behind it for next time. A new release still arrives on the same
  // launch: the new sw.js installs, and the page reloads into it.
  if (req.mode === 'navigate') {
    const refresh = (async () => {
      try {
        // 'reload' skips the browser's HTTP cache (GitHub Pages: max-age=600).
        const fresh = await fetch(req, { cache: 'reload' });
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(req, fresh.clone());
        }
        return fresh;
      } catch { return null; }
    })();
    e.respondWith((async () => {
      const cached = (await caches.match(req, { ignoreSearch: true })) ||
                     (await caches.match('index.html'));
      if (cached) { e.waitUntil(refresh); return cached; }
      return (await refresh) ||
             (await caches.match('RAMSAPP.HTML')) ||
             (await caches.match('./')) ||
             new Response('Offline', { status: 503 });
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
