import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearResortReportCache, getResortReportView, loadResortReports, parseResortReports,
  RESORT_REPORT_CACHE_TTL_MS, RESORT_REPORT_MAX_AGE_MS,
} from '../src/lib/resort-reports';

const NOW = new Date('2026-01-20T01:00:00Z'); // 10:00 JST
const TODAY = '2026-01-20';
function payload() {
  return {
    version: 1,
    generatedAt: '2026-01-20T00:30:00Z',
    reports: {
      myoko: {
        sourceName: 'Akakura Kanko official report', sourceUrl: 'https://www.akr-ski.com/',
        reportedAt: '2026-01-20T08:00:00+09:00', reportDate: TODAY, station: 'Base station',
        snowfall24hCm: 24.5, depthCm: 180,
        operations: {
          status: 'partial', reportedAt: '2026-01-20T09:00:00+09:00', reportDate: TODAY,
          details: 'Some lifts operating.', sourceUrl: 'https://www.akr-ski.com/lifts/',
        },
        webcamUrl: 'https://www.akr-ski.com/webcam/',
      },
    },
  };
}
function view(value = payload(), date = TODAY, now = NOW) {
  return getResortReportView(parseResortReports(value), 'myoko', date, now);
}

describe('official resort report validation and freshness', () => {
  it('preserves separate observed fresh snow/depth, station, provenance and partial operations', () => {
    const result = view();
    expect(result.snowfall24h).toEqual({ valueCm: 24.5, status: 'fresh' });
    expect(result.depth).toEqual({ valueCm: 180, status: 'fresh' });
    expect(result.report?.station).toBe('Base station');
    expect(result.report?.reportedAt).toBe('2026-01-19T23:00:00.000Z');
    expect(result.operations.status).toBe('partial');
    expect(result.operations.appliesToTripDate).toBe(true);
    expect(result.report?.webcamUrl).toBe('https://www.akr-ski.com/webcam/');
  });

  it('keeps genuine zero fresh snow while leaving missing depth unknown', () => {
    const value = payload();
    value.reports.myoko.snowfall24hCm = 0;
    (value.reports.myoko as unknown as Record<string, unknown>).depthCm = null;
    expect(view(value).snowfall24h).toEqual({ valueCm: 0, status: 'fresh' });
    expect(view(value).depth).toEqual({ valueCm: null, status: 'unavailable' });
  });

  it('rejects negative, string and non-finite values independently without losing a good metric', () => {
    for (const bad of [-1, '30', Infinity, NaN]) {
      const value = payload();
      (value.reports.myoko as unknown as Record<string, unknown>).snowfall24hCm = bad;
      expect(view(value).snowfall24h).toEqual({ valueCm: null, status: 'unavailable' });
      expect(view(value).depth.valueCm).toBe(180);
    }
  });

  it('labels yesterday and observations at least 24 hours old stale, preserving last known values', () => {
    const value = payload();
    value.reports.myoko.reportDate = '2026-01-19';
    expect(view(value).depth).toEqual({ valueCm: 180, status: 'stale' });
    value.reports.myoko.reportDate = TODAY;
    value.reports.myoko.reportedAt = new Date(NOW.getTime() - RESORT_REPORT_MAX_AGE_MS).toISOString();
    expect(view(value).snowfall24h.status).toBe('stale');
  });

  it('does not show future-dated or untimed values as current or stale measurements', () => {
    for (const bad of [null, 'not a date', '2026-01-20T10:01:00+09:00', '2026-02-30T08:00:00+09:00', '2026-01-19T24:00:00Z']) {
      const value = payload();
      (value.reports.myoko as unknown as Record<string, unknown>).reportedAt = bad;
      expect(view(value).depth).toEqual({ valueCm: null, status: 'unavailable' });
      // Independent lift report can still be useful.
      expect(view(value).operations.freshness).toBe('fresh');
    }
    const value = payload();
    value.reports.myoko.reportDate = '2026-01-21';
    expect(view(value).depth.status).toBe('unavailable');
  });

  it('requires an explicit valid report date, never assigning retrieval day to undated reports', () => {
    for (const bad of [null, '2026-02-30', '2026-1-20']) {
      const value = payload();
      (value.reports.myoko as unknown as Record<string, unknown>).reportDate = bad;
      expect(view(value).depth.status).toBe('unavailable');
    }
  });

  it('never verifies tomorrow from today’s operations, including across the Japan midnight boundary', () => {
    const value = payload();
    value.reports.myoko.operations.status = 'open';
    expect(view(value, '2026-01-21').operations.appliesToTripDate).toBe(false);
    expect(view(value, TODAY).operations.appliesToTripDate).toBe(true);
    const afterMidnight = new Date('2026-01-20T15:01:00Z');
    const result = view(value, '2026-01-21', afterMidnight);
    expect(result.operations.freshness).toBe('stale');
    expect(result.operations.appliesToTripDate).toBe(false);
  });

  it('retains explicit hold/closed states but never promotes unknown status or missing times to confirmed access', () => {
    for (const status of ['hold', 'closed']) {
      const value = payload();
      value.reports.myoko.operations.status = status;
      expect(view(value).operations.status).toBe(status);
    }
    const value = payload();
    value.reports.myoko.operations.status = 'probably open';
    expect(view(value).operations.status).toBe('unknown');
    expect(view(value).operations.appliesToTripDate).toBe(false);
    (value.reports.myoko.operations as unknown as Record<string, unknown>).status = ['open'];
    expect(view(value).operations.status).toBe('unknown');
    (value.reports.myoko.operations as unknown as Record<string, unknown>).reportedAt = null;
    expect(view(value).operations.freshness).toBe('unavailable');
  });

  it('rejects unsafe source links and drops an invalid optional webcam or operation independently', () => {
    for (const url of ['javascript:alert(1)', '//example.com/report', 'http://example.com/', 'https://user:secret@example.com/']) {
      const value = payload();
      value.reports.myoko.sourceUrl = url;
      expect(view(value).report).toBeNull();
    }
    const value = payload();
    value.reports.myoko.webcamUrl = 'data:text/html,example';
    value.reports.myoko.operations.sourceUrl = 'javascript:alert(1)';
    expect(view(value).report?.webcamUrl).toBeNull();
    expect(view(value).operations.freshness).toBe('unavailable');
    expect(view(value).snowfall24h.valueCm).toBe(24.5);
  });

  it('rejects an invalid/versioned envelope and ignores invalid report entries without guessing values', () => {
    for (const value of [null, [], { ...payload(), version: 2 }, { ...payload(), generatedAt: 'today' }, { ...payload(), reports: [] }]) {
      expect(() => parseResortReports(value)).toThrow(/unreadable/);
    }
    const result = parseResortReports({ ...payload(), reports: { ...payload().reports, '../other': payload().reports.myoko, bad: [] } });
    expect(Object.keys(result.reports)).toEqual(['myoko']);
    const unavailable = getResortReportView(result, 'unconnected-resort', TODAY, NOW);
    expect(unavailable.report).toBeNull();
    expect(unavailable.snowfall24h.status).toBe('unavailable');
    expect(unavailable.operations.status).toBe('unknown');
  });
});

describe('report file request/cache lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); clearResortReportCache(); });
  afterEach(() => { clearResortReportCache(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  const successfulFetch = () => vi.fn().mockImplementation(async () => ({ ok: true, json: async () => payload() }));

  it('shares one same-origin report file across resorts for 15 minutes and revalidates after expiry', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const [first, second] = await Promise.all([loadResortReports(), loadResortReports()]);
    expect(first).toBe(second);
    await loadResortReports();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${import.meta.env.BASE_URL}data/resort-reports.json`);
    expect(fetchMock.mock.calls[0][1].cache).toBe('no-cache');
    vi.setSystemTime(new Date(NOW.getTime() + RESORT_REPORT_CACHE_TTL_MS));
    await loadResortReports();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache HTTP or invalid JSON errors forever; an immediate retry can succeed', async () => {
    const fetchMock = successfulFetch();
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 404 }));
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ version: 99 }) }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadResortReports()).rejects.toThrow(/HTTP 404/);
    await expect(loadResortReports()).rejects.toThrow(/unreadable/);
    expect((await loadResortReports()).reports.myoko.depthCm).toBe(180);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('allows one consumer to cancel without aborting another resort’s report reader', async () => {
    let resolve!: (value: unknown) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const cancelled = loadResortReports({ signal: controller.signal });
    const retained = loadResortReports();
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(false);
    resolve({ ok: true, json: async () => payload() });
    expect((await retained).reports.myoko.snowfall24hCm).toBe(24.5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts when every consumer leaves and allows the next mount to start a fresh request', async () => {
    const fetchMock = successfulFetch();
    fetchMock.mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const first = loadResortReports({ signal: controller.signal });
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await loadResortReports();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let a request predating manual cache clearing repopulate the new cache', async () => {
    let resolve!: (value: unknown) => void;
    const fetchMock = successfulFetch();
    fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetchMock);
    const older = loadResortReports();
    clearResortReportCache();
    const fresh = await loadResortReports();
    const oldPayload = payload();
    oldPayload.reports.myoko.depthCm = 99;
    resolve({ ok: true, json: async () => oldPayload });
    expect((await older).reports.myoko.depthCm).toBe(99);
    expect((await loadResortReports()).reports.myoko.depthCm).toBe(fresh.reports.myoko.depthCm);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('manual refresh bypasses a good cache, while an already aborted reader never starts a download', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(loadResortReports({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    await loadResortReports();
    await loadResortReports({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('times out a stuck download without preventing a later successful retry', async () => {
    const fetchMock = successfulFetch();
    fetchMock.mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const first = loadResortReports();
    const expected = expect(first).rejects.toThrow(/too long/);
    await vi.advanceTimersByTimeAsync(15_000);
    await expected;
    await loadResortReports();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
