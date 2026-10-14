import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const compiled = ['assets/entry-12345678.js', 'assets/deferred-98765432.js', 'assets/snow-cloud-abcdef12.webp'];
interface RequestStub { url: string; method: string; mode: string; destination: string }
interface EventStub {
  request?: RequestStub;
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
}

function worker(scope = 'https://example.com/powder-chaser/') {
  const handlers = new Map<string, (event: EventStub) => void>();
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: RequestStub | string) => entries.get(typeof request === 'string' ? request : request.url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => { entries.set(url, response.clone()); }),
    addAll: vi.fn(async (urls: string[]) => {
      if (new Set(urls).size !== urls.length) throw new Error('Duplicate precache URL');
      for (const url of urls) entries.set(url, new Response(`cached:${url}`));
    }),
  };
  const prefix = `powder-chaser:${scope}:`;
  const otherScope = scope.includes('/staging/') ? scope.replace('staging/', '') : `${scope}staging/`;
  const caches = {
    open: vi.fn(async () => cache),
    match: cache.match,
    keys: vi.fn(async () => [`${prefix}old`, `${prefix}test-release`, `powder-chaser:${otherScope}:old`]),
    delete: vi.fn(async () => true),
  };
  const network = vi.fn(async (input: string | RequestStub) => {
    const url = typeof input === 'string' ? input : input.url;
    return new Response(url.endsWith('/index.html')
      ? `<script type="module" src="${new URL(compiled[0], scope).pathname}"></script>`
      : `network:${url}`);
  });
  runInNewContext(source
    .replace('__POWDER_CHASER_RELEASE__', 'test-release')
    .replace('/* __POWDER_CHASER_ASSET_PATHS__ */ []', JSON.stringify(compiled)), {
    URL, Response, fetch: network, caches,
    self: {
      registration: { scope }, clients: { claim: vi.fn(async () => undefined) },
      addEventListener: (name: string, listener: (event: EventStub) => void) => handlers.set(name, listener),
    },
  });
  async function lifecycle(name: string) {
    const promises: Promise<unknown>[] = [];
    handlers.get(name)!({ waitUntil: promise => { promises.push(promise); }, respondWith: () => undefined });
    await Promise.all(promises);
  }
  async function request(url: string, destination = 'image') {
    const result: { response?: Promise<Response> } = {};
    handlers.get('fetch')!({
      request: { url, method: 'GET', mode: 'cors', destination },
      waitUntil: () => undefined,
      respondWith: promise => { result.response = promise; },
    });
    return result.response ? await result.response : null;
  }
  return { scope, cache, caches, network, lifecycle, request };
}

describe('release-scoped offline assets', () => {
  it('precaches compiled illustrations and deferred chunks without duplicate entry URLs', async () => {
    const app = worker();
    await app.lifecycle('install');
    const urls = app.cache.addAll.mock.calls[0][0];
    expect(new Set(urls).size).toBe(urls.length);
    for (const asset of compiled) expect(urls).toContain(new URL(asset, app.scope).href);
    expect(urls).toContain(new URL('icons/apple-touch-icon-alpine.png', app.scope).href);
  });

  it('serves cached release images and icons without waiting for a network request', async () => {
    const app = worker();
    await app.lifecycle('install');
    app.network.mockClear();
    for (const path of [compiled[2], 'icons/apple-touch-icon-alpine.png']) {
      const url = new URL(path, app.scope).href;
      expect(await (await app.request(url))?.text()).toBe(`cached:${url}`);
    }
    expect(app.network).not.toHaveBeenCalled();
  });

  it('leaves external weather requests outside the service worker', async () => {
    const app = worker();
    expect(await app.request('https://api.open-meteo.com/v1/forecast', '')).toBeNull();
    expect(app.caches.open).not.toHaveBeenCalled();
    expect(app.network).not.toHaveBeenCalled();
  });

  it.each([
    ['https://example.com/powder-chaser/', 'https://example.com/powder-chaser/staging/assets/image-12345678.webp'],
    ['https://example.com/powder-chaser/staging/', 'https://example.com/powder-chaser/assets/image-12345678.webp'],
  ])('keeps the %s worker out of the other environment', async (scope, url) => {
    const app = worker(scope);
    expect(await app.request(url)).toBeNull();
    expect(app.caches.open).not.toHaveBeenCalled();
  });

  it('removes only older caches in its own environment', async () => {
    const app = worker();
    await app.lifecycle('activate');
    expect(app.caches.delete.mock.calls).toEqual([[`powder-chaser:${app.scope}:old`]]);
  });
});
