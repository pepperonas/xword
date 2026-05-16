/**
 * xword Service Worker
 *
 * Strategy:
 *   - App shell (HTML/CSS/JS/assets/fonts) → stale-while-revalidate, cached locally
 *   - Puzzle JSON files → network-first (latest puzzles wanted), fallback to cache
 *   - /api/* → never cached, must hit the network (auth, progress)
 *   - Cross-origin (fonts.googleapis.com etc.) → cache-first opaque responses
 *
 * Bump the version when shipping app-shell changes so old caches are purged.
 */
const VERSION = 'xword-v5';
const SHELL_CACHE = VERSION + '-shell';
const PUZZLE_CACHE = VERSION + '-puzzles';
const FONTS_CACHE = VERSION + '-fonts';

const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/xword.png',
  '/version.json',
  '/manifest.webmanifest',
  '/assets/styles.css',
  '/assets/layout.js',
  '/assets/input-dedupe.js',
  '/assets/dialog.js',
  '/assets/engine.js',
  '/assets/auth.js',
  '/assets/app.js',
  '/assets/theme-init.js',
  '/impressum.html',
  '/datenschutz.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache API calls.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
    return; // fall through to default network behaviour
  }

  // Puzzles: network-first, cache-fallback. Keeps content fresh online,
  // works offline with the last-seen version.
  if (url.origin === location.origin && url.pathname.startsWith('/puzzles/')) {
    event.respondWith(networkFirst(req, PUZZLE_CACHE));
    return;
  }

  // Google Fonts (cross-origin) — long-lived cache.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONTS_CACHE));
    return;
  }

  // App shell: stale-while-revalidate for same-origin GETs.
  if (url.origin === location.origin) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
  }
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw new Error('network and cache both unavailable');
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || networkPromise;
}
