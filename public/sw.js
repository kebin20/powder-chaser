/* Built releases replace this marker with a digest of their static assets. */
const RELEASE = '__POWDER_CHASER_RELEASE__';
const APP_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `powder-chaser:${APP_URL.href}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE}`;
const INDEX_URL = new URL('index.html', APP_URL).href;
const COMPILED_PATHS = /* __POWDER_CHASER_ASSET_PATHS__ */ [];
const SHELL_PATHS = [
  'manifest.webmanifest', 'icons/favicon-alpine.svg', 'icons/favicon-alpine.ico',
  'icons/icon-alpine-32.png', 'icons/apple-touch-icon-alpine.png',
  'icons/icon-alpine-192.png', 'icons/icon-alpine-512.png',
  'icons/maskable-alpine-192.png', 'icons/maskable-alpine-512.png',
];
const RELEASE_URLS = new Set([...SHELL_PATHS, ...COMPILED_PATHS]
  .map((path) => new URL(path, APP_URL).href));

function isAppResource(url) {
  if (url.origin !== APP_URL.origin || !url.pathname.startsWith(APP_URL.pathname)) return false;
  const relativePath = url.pathname.slice(APP_URL.pathname.length);
  // A live worker's scope contains the staging URL, but each app has its own
  // worker and cache. Never intercept another environment's requests.
  return !relativePath.startsWith('staging/');
}

// Runtime caching is optional: storage limits or browser privacy settings must
// never turn a successful network response into a failed page or asset request.
// Installation remains strict so an incomplete offline shell cannot activate.
async function openRuntimeCache() {
  try { return await caches.open(CACHE_NAME); } catch { return null; }
}

async function readRuntimeCache(cache, request, options) {
  try { return await cache?.match(request, options); } catch { return undefined; }
}

async function writeRuntimeCache(cache, request, response) {
  try { await cache?.put(request, response.clone()); } catch { /* Continue online without caching. */ }
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
    // Include compiled illustrations and any deferred chunks, not only the
    // entry points linked from HTML. Dedupe overlapping URLs before addAll.
    await cache.addAll([...new Set([...RELEASE_URLS, ...entryAssets])]);
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
          await writeRuntimeCache(await openRuntimeCache(), INDEX_URL, response);
        }
        return response;
      } catch {
        return (await readRuntimeCache(await openRuntimeCache(), INDEX_URL)) ?? Response.error();
      }
    })());
    return;
  }

  // External weather APIs, reports, and arbitrary same-origin endpoints are
  // never cached. Only known static destinations participate in shell caching.
  if (!['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) return;
  const isHashedAsset = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(url.pathname);
  event.respondWith((async () => {
    const cache = await openRuntimeCache();
    // These URLs identify fixed release content. A server's Vary: Origin must
    // not hide a precached file from its later same-origin CORS module request.
    const fixedAsset = isHashedAsset || RELEASE_URLS.has(url.href);
    const cached = await readRuntimeCache(cache, request, fixedAsset ? { ignoreVary: true } : undefined);
    if (fixedAsset && cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await writeRuntimeCache(cache, request, response);
      return response;
    } catch {
      return cached ?? Response.error();
    }
  })());
});
