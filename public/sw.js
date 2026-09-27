/* global self, caches, fetch, URL */
/*
 * CampusOS service worker (CAMPUSOS-017).
 *
 * Deliberately conservative: it caches ONLY static, non-personal files
 * (Next.js build assets, icons, fonts, illustrations) and one offline page.
 * Pages and API responses — which contain personal data — are never stored:
 * they always go to the network, and if the network is down the visitor sees
 * the offline page instead of someone's cached timetable.
 */
const VERSION = 'campusos-v1';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, '/branding/icon-192.png', '/branding/campusos-app-icon.svg'])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/branding/') || url.pathname.startsWith('/illustrations/') || /\.(woff2?|ttf)$/.test(url.pathname))
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Static build assets: cache-first (they are content-hashed).
  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Page navigations: network only; the offline page when there is no network.
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
  // Everything else (API, data): straight to the network, never cached.
});
