/* Built releases replace this marker with a digest of their static assets. */
const RELEASE = '__POWDER_CHASER_RELEASE__';
const APP_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `powder-chaser:${APP_URL.href}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE}`;
const INDEX_URL = new URL('index.html', APP_URL).href;
const SHELL_PATHS = [
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'images/snow-cloud.png', 'images/snowy-tree.png',
];

function isAppResource(url) {
  if (url.origin !== APP_URL.origin || !url.pathname.startsWith(APP_URL.pathname)) return false;
  const relativePath = url.pathname.slice(APP_URL.pathname.length);
  // A live worker's scope contains the staging URL, but each app has its own
  // worker and cache. Never intercept another environment's requests.
  return !relativePath.startsWith('staging/');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(INDEX_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error('App shell unavailable');
    const html = await response.clone().text();
    await cache.put(INDEX_URL, response);
    const entryAssets = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], APP_URL))
      .filter((url) => isAppResource(url) && url.pathname.includes('/assets/'))
      .map((url) => url.href);
    await cache.addAll([...SHELL_PATHS.map((path) => new URL(path, APP_URL).href), ...entryAssets]);
    // The new worker activates when old tabs close, preserving their assets.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !isAppResource(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(INDEX_URL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(INDEX_URL)) ?? Response.error();
      }
    })());
    return;
  }

  // External weather APIs, reports, and arbitrary same-origin endpoints are
  // never cached. Only known static destinations participate in shell caching.
  if (!['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) return;
  const isHashedAsset = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(url.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (isHashedAsset && cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return cached ?? Response.error();
    }
  })());
});
