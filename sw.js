/* ═══════════════════════════════════════════════════════════════════
   Aspen Spas — Chemical Maintenance Dashboard · Service Worker
   ═══════════════════════════════════════════════════════════════════
   Deploy alongside index.html (same folder, same commit — like
   TECH-TICKETS). Bump CACHE_VERSION on every release to trigger the
   in-app "Nueva versión / New version" banner on all devices.

   Strategy:
   - App shell (index.html): network-first with cache fallback — updates
     arrive normally, and the PWA still opens with no signal.
   - CDN assets (Firebase SDK, Leaflet, fonts, map tiles) and Storage
     photos: network-first with cache fallback, cached on success.
   - Firebase data traffic (RTDB websockets, auth POSTs) is never
     intercepted: non-GET requests and non-matched hosts pass through.
   ═══════════════════════════════════════════════════════════════════ */
const CACHE_VERSION = 'cm-v1.1.1';
const APP_SHELL = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(APP_SHELL))
      .catch(() => {/* offline install — shell gets cached on first fetch */})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The in-app update banner posts this when the user taps "Actualizar"
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Hosts whose GET responses are safe (and useful) to cache for offline use
const RUNTIME_HOSTS = /(^|\.)(gstatic\.com|googleapis\.com|unpkg\.com|cdnjs\.cloudflare\.com|tile\.openstreetmap\.org)$/;

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return; // never touch auth/DB writes

  const url = new URL(e.request.url);

  // Same-origin → app shell: network-first, cache fallback
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const cp = r.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, cp)).catch(() => {});
          return r;
        })
        .catch(() =>
          caches.match(e.request).then(m => m || caches.match('./index.html'))
        )
    );
    return;
  }

  // Cross-origin CDN / fonts / map tiles / Storage photos: network-first,
  // cache on success, serve stale copy offline.
  if (RUNTIME_HOSTS.test(url.hostname)) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const cp = r.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, cp)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(e.request))
    );
  }
  // Anything else (firebaseio websockets, identitytoolkit, etc.) passes through untouched.
});
