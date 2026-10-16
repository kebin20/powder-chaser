import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESORTS } from '../src/data/resorts';
import { addDays } from '../src/lib/dates';
import {
  buildHistoryUrl, clearHistoryCache, fetchSnowfallHistory, getCompletedSeasonWindows,
  hasOfficialSnowfallHistory, HISTORY_CACHE_MAX_ENTRIES, HISTORY_CACHE_TTL_MS,
  HISTORY_REQUEST_TIMEOUT_MS, parseHistoryResponse,
  type HistoryRange,
} from '../src/lib/history';

const NOW = new Date('2026-10-15T03:00:00Z');
const RESORT = RESORTS.find((resort) => resort.id === 'myoko')!;
const NISEKO = RESORTS.find((resort) => resort.id === 'niseko')!;
function response(range: HistoryRange = 5, snow = 2, now = NOW) {
  const windows = getCompletedSeasonWindows(range, now);
  const start = windows[0].startDate;
  const end = windows.at(-1)!.endDate;
  const length = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  const time = Array.from({ length }, (_, index) => addDays(start, index));
  return {
    timezone: 'Asia/Tokyo', utc_offset_seconds: 32400,
    daily_units: { time: 'iso8601', snowfall_sum: 'cm' },
    daily: { time, snowfall_sum: time.map(() => snow) as (number | null)[] },
  };
}

describe('completed Japan winter windows', () => {
  it('uses November–April winter seasons rather than calendar-year totals', () => {
    const windows = getCompletedSeasonWindows(5, NOW);
    expect(windows).toHaveLength(5);
    expect(windows[0]).toEqual({ season: '2021/22', startDate: '2021-11-01', endDate: '2022-04-30' });
    expect(windows.at(-1)?.season).toBe('2025/26');
    expect(getCompletedSeasonWindows(10, NOW)[0].season).toBe('2016/17');
  });
  it('does not compare an unfinished season and switches at midnight in Japan', () => {
    expect(getCompletedSeasonWindows(5, new Date('2026-04-30T14:59:00Z')).at(-1)?.season).toBe('2024/25');
    expect(getCompletedSeasonWindows(5, new Date('2026-04-30T15:00:00Z')).at(-1)?.season).toBe('2025/26');
    expect(getCompletedSeasonWindows(5, new Date('2026-01-15T12:00:00Z')).at(-1)?.season).toBe('2024/25');
  });
  it('pins ERA5, JST and centimetre snowfall, and respects the archive delay', () => {
    const url = new URL(buildHistoryUrl(RESORT, 'upper', 10, NOW));
    expect(url.origin).toBe('https://archive-api.open-meteo.com');
    expect(url.searchParams.get('models')).toBe('era5');
    expect(url.searchParams.get('daily')).toBe('snowfall_sum');
    expect(url.searchParams.get('timezone')).toBe('Asia/Tokyo');
    expect(url.searchParams.get('elevation')).toBe(String(RESORT.upperElevationM));
    expect(url.searchParams.get('start_date')).toBe('2016-11-01');
    expect(url.searchParams.get('end_date')).toBe('2026-04-30');
    expect(new URL(buildHistoryUrl(RESORT, 'upper', 5, new Date('2026-05-01T03:00:00Z'))).searchParams.get('end_date')).toBe('2026-04-25');
  });
  it('allows an unknown elevation without claiming an upper-mountain observation', () => {
    const resort = { ...RESORT, upperElevationM: null };
    expect(new URL(buildHistoryUrl(resort, 'upper', 5, NOW)).searchParams.has('elevation')).toBe(false);
    const history = parseHistoryResponse(response(), resort, 'upper', 5, NOW.toISOString(), NOW);
    expect(history.elevationM).toBeNull();
    expect(history.seasons[0].location).toMatch(/Resort area/);
    expect(history.warnings.join(' ')).toMatch(/no verified base or upper/);
  });
  it('rejects invalid ranges, coordinates and known heights before calling a provider', () => {
    expect(() => getCompletedSeasonWindows(3 as HistoryRange, NOW)).toThrow(/five or ten/);
    expect(() => buildHistoryUrl({ ...RESORT, latitude: 1 }, 'upper', 5, NOW)).toThrow(/Japan/);
    expect(() => buildHistoryUrl({ ...RESORT, upperElevationM: -1 }, 'upper', 5, NOW)).toThrow(/elevation/);
    expect(() => buildHistoryUrl({ ...RESORT, upperElevationM: Number.NaN }, 'upper', 5, NOW)).toThrow(/elevation/);
  });
});

describe('historical daily snowfall aggregation', () => {
  it('sums each winter and month, includes leap days, and excludes summer snow', () => {
    const payload = response();
    payload.daily.snowfall_sum[payload.daily.time.indexOf('2023-07-01')] = 999;
    const history = parseHistoryResponse(payload, RESORT, 'upper', 5, NOW.toISOString(), NOW);
    const season = history.seasons.find((item) => item.season === '2023/24')!;
    expect(season).toMatchObject({ totalCm: 364, availableDays: 182, expectedDays: 182, complete: true });
    expect(season.monthly.find((item) => item.month === '2024-02')).toMatchObject({ totalCm: 58, complete: true });
    expect(season.monthly).toHaveLength(6);
    expect(history.sourceKind).toBe('estimate');
    expect(history.sourceName).toContain('ERA5');
    expect(history.retrievedAt).toBe(NOW.toISOString());
    expect(history.warnings.join(' ')).toMatch(/not resort observations/);
  });
  it('preserves genuine zero winters and distinguishes them from missing data', () => {
    const history = parseHistoryResponse(response(5, 0), RESORT, 'upper', 5, NOW.toISOString(), NOW);
    expect(history.seasons.every((season) => season.complete && season.totalCm === 0)).toBe(true);
  });
  it('retains tenths of a centimeter in winter and monthly totals', () => {
    const payload = response(5, 0);
    payload.daily.snowfall_sum[payload.daily.time.indexOf('2025-11-01')] = 0.4;
    const season = parseHistoryResponse(payload, RESORT, 'upper', 5, NOW.toISOString(), NOW).seasons.at(-1)!;
    expect(season.totalCm).toBe(0.4);
    expect(season.monthly[0].totalCm).toBe(0.4);
  });
  it('a null day invalidates the full season and only that month, with no zero fill', () => {
    const payload = response();
    payload.daily.snowfall_sum[payload.daily.time.indexOf('2024-01-10')] = null;
    const season = parseHistoryResponse(payload, RESORT, 'upper', 5, NOW.toISOString(), NOW).seasons.find((item) => item.season === '2023/24')!;
    expect(season).toMatchObject({ complete: false, totalCm: null, availableDays: 181 });
    expect(season.monthly.find((item) => item.month === '2024-01')).toMatchObject({ complete: false, totalCm: null });
    expect(season.monthly.find((item) => item.month === '2024-02')?.totalCm).toBe(58);
  });
  it('handles missing and duplicate expected dates as gaps instead of double counting', () => {
    const missing = response();
    const index = missing.daily.time.indexOf('2024-01-10');
    missing.daily.time.splice(index, 1);
    missing.daily.snowfall_sum.splice(index, 1);
    const duplicate = response();
    duplicate.daily.time.push('2024-01-10');
    duplicate.daily.snowfall_sum.push(999);
    for (const payload of [missing, duplicate]) {
      expect(parseHistoryResponse(payload, RESORT, 'upper', 5, NOW.toISOString(), NOW).seasons.find((item) => item.season === '2023/24')?.totalCm).toBeNull();
    }
  });
  it('rejects unreadable payloads, unequal arrays, wrong units, wrong time zones and impossible dates', () => {
    const wrongUnits = response(); wrongUnits.daily_units.snowfall_sum = 'inch';
    const wrongZone = response(); wrongZone.utc_offset_seconds = 0;
    const badDate = response(); badDate.daily.time[0] = '2021-02-30';
    const mismatch = response(); mismatch.daily.snowfall_sum.pop();
    for (const payload of [null, { error: true }, wrongUnits, wrongZone, badDate, mismatch]) {
      expect(() => parseHistoryResponse(payload, RESORT, 'upper', 5, NOW.toISOString(), NOW)).toThrow();
    }
  });
  it('negative and non-finite snowfall are missing instead of lowering or inflating totals', () => {
    for (const value of [-2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const payload = response(); payload.daily.snowfall_sum[0] = value;
      expect(parseHistoryResponse(payload, RESORT, 'upper', 5, NOW.toISOString(), NOW).seasons[0].totalCm).toBeNull();
    }
    const overflow = parseHistoryResponse(response(5, Number.MAX_VALUE), RESORT, 'upper', 5, NOW.toISOString(), NOW);
    expect(overflow.seasons.every((season) => season.totalCm === null && !season.complete)).toBe(true);
  });
});

describe('source separation and bounded history requests', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    clearHistoryCache();
  });
  afterEach(() => { clearHistoryCache(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('defaults to dated official Niseko records without any provider request', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    expect(hasOfficialSnowfallHistory(NISEKO)).toBe(true);
    expect(hasOfficialSnowfallHistory(RESORT)).toBe(false);
    const history = await fetchSnowfallHistory(NISEKO, 'upper', 10);
    expect(history.sourceKind).toBe('resort');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(history.elevationM).toBeNull();
    expect(history.seasons.find((season) => season.season === '2021/22')).toMatchObject({ totalCm: 1450, complete: true, reportedAt: '2023-05-23', startDate: null, monthly: [] });
    expect(history.seasons.find((season) => season.season === '2024/25')).toMatchObject({ totalCm: 1283, complete: false, reportedAt: '2025-04-17' });
    expect(history.seasons.find((season) => season.season === '2025/26')).toMatchObject({ totalCm: 1350, complete: true });
    expect(history.seasons.find((season) => season.season === '2017/18')).toMatchObject({ totalCm: null, complete: false, sourceUrl: null });
    expect(history.warnings.join(' ')).toMatch(/do not form a uniform series/);
  });
  it('offers estimates as a completely separate dataset for an official-record resort', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response() }));
    const history = await fetchSnowfallHistory(NISEKO, 'upper', 5, undefined, 'estimate');
    expect(history.sourceKind).toBe('estimate');
    expect(history.seasons.find((season) => season.season === '2024/25')?.totalCm).toBe(362);
    expect(history.seasons.every((season) => season.sourceUrl?.includes('open-meteo'))).toBe(true);
    await expect(fetchSnowfallHistory(RESORT, 'upper', 5, undefined, 'resort')).rejects.toThrow(/not available/);
  });
  it('caches only verified complete payloads for seven days and keeps elevation and resort selections separate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response() }); vi.stubGlobal('fetch', fetchMock);
    const first = await fetchSnowfallHistory(RESORT, 'upper', 5);
    vi.setSystemTime(new Date(NOW.getTime() + HISTORY_CACHE_TTL_MS - 1));
    expect((await fetchSnowfallHistory(RESORT, 'upper', 5)).retrievedAt).toBe(first.retrievedAt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchSnowfallHistory(RESORT, 'base', 5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date(NOW.getTime() + HISTORY_CACHE_TTL_MS));
    await fetchSnowfallHistory(RESORT, 'upper', 5);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(storage.has('powder-history-v1')).toBe(true);
  });
  it('reuses ten cached winters for five and recalculates the requested summaries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response(10) }); vi.stubGlobal('fetch', fetchMock);
    const ten = await fetchSnowfallHistory(RESORT, 'upper', 10);
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    const five = await fetchSnowfallHistory(RESORT, 'upper', 5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(five.seasons).toEqual(ten.seasons.slice(-5));
    expect(five.retrievedAt).toBe(ten.retrievedAt);
    expect(five.seasons[0].season).toBe('2021/22');
    expect(JSON.parse(storage.get('powder-history-v1')!)).toHaveLength(1);
  });
  it('does not mistake a cached five-winter payload for a ten-winter history', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response(5) })
      .mockResolvedValueOnce({ ok: true, json: async () => response(10) }); vi.stubGlobal('fetch', fetchMock);
    await fetchSnowfallHistory(RESORT, 'upper', 5);
    const ten = await fetchSnowfallHistory(RESORT, 'upper', 10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ten.seasons).toHaveLength(10);
    expect(ten.seasons[0]).toMatchObject({ season: '2016/17', complete: true });
  });
  it('shares identical automatic or known heights while preserving caller metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response(10) }); vi.stubGlobal('fetch', fetchMock);
    const unknown = { ...RESORT, baseElevationM: null, upperElevationM: null };
    await fetchSnowfallHistory(unknown, 'upper', 10);
    const automaticBase = await fetchSnowfallHistory(unknown, 'base', 5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(automaticBase).toMatchObject({ elevation: 'base', elevationM: null });
    expect(automaticBase.seasons[0].location).toMatch(/Resort area/);
    const equal = { ...RESORT, id: 'equal-heights', baseElevationM: 1000, upperElevationM: 1000 };
    const upper = await fetchSnowfallHistory(equal, 'upper', 10);
    const base = await fetchSnowfallHistory(equal, 'base', 5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(upper.seasons[0].location).toMatch(/Upper mountain reference/);
    expect(base).toMatchObject({ elevation: 'base', elevationM: 1000 });
    expect(base.seasons[0].location).toMatch(/Base reference/);
  });
  it('expires a superset at seven days instead of renewing its timestamp on reuse', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response(10) }); vi.stubGlobal('fetch', fetchMock);
    const first = await fetchSnowfallHistory(RESORT, 'upper', 10);
    vi.setSystemTime(new Date(NOW.getTime() + HISTORY_CACHE_TTL_MS - 1));
    expect((await fetchSnowfallHistory(RESORT, 'upper', 5)).retrievedAt).toBe(first.retrievedAt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(NOW.getTime() + HISTORY_CACHE_TTL_MS));
    await fetchSnowfallHistory(RESORT, 'upper', 5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('revalidates persistent supersets and ignores gaps only outside the requested winters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response(10) }); vi.stubGlobal('fetch', fetchMock);
    await fetchSnowfallHistory(RESORT, 'upper', 10);
    const entries = JSON.parse(storage.get('powder-history-v1')!);
    const payload = entries[0].response;
    payload.daily.snowfall_sum[payload.daily.time.indexOf('2017-01-10')] = null;
    storage.set('powder-history-v1', JSON.stringify(entries));
    vi.resetModules();
    const outsideGap = await import('../src/lib/history');
    const subset = await outsideGap.fetchSnowfallHistory(RESORT, 'upper', 5);
    expect(subset.seasons.every(season => season.complete)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    payload.daily.snowfall_sum[payload.daily.time.indexOf('2024-01-10')] = null;
    storage.set('powder-history-v1', JSON.stringify(entries));
    vi.resetModules();
    const insideGap = await import('../src/lib/history');
    expect((await insideGap.fetchSnowfallHistory(RESORT, 'upper', 5)).seasons.every(season => season.complete)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid superset units even when all requested dates are present', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response(10) }); vi.stubGlobal('fetch', fetchMock);
    await fetchSnowfallHistory(RESORT, 'upper', 10);
    const entries = JSON.parse(storage.get('powder-history-v1')!);
    entries[0].response.daily_units.snowfall_sum = 'inch';
    storage.set('powder-history-v1', JSON.stringify(entries));
    vi.resetModules();
    const afterReload = await import('../src/lib/history');
    expect((await afterReload.fetchSnowfallHistory(RESORT, 'upper', 5)).sourceKind).toBe('estimate');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not cache incomplete seasons or unsuccessful responses', async () => {
    const incomplete = response(); incomplete.daily.snowfall_sum[0] = null;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => incomplete }); vi.stubGlobal('fetch', fetchMock);
    await fetchSnowfallHistory(RESORT, 'upper', 5);
    await fetchSnowfallHistory(RESORT, 'upper', 5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storage.has('powder-history-v1')).toBe(false);
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    await expect(fetchSnowfallHistory(RESORT, 'upper', 5)).rejects.toThrow(/HTTP 429/);
  });
  it('restores persistent payloads after reload and reparses corrupt browser storage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response() }); vi.stubGlobal('fetch', fetchMock);
    await fetchSnowfallHistory(RESORT, 'upper', 5);
    const persisted = storage.get('powder-history-v1')!;
    vi.resetModules();
    const afterReload = await import('../src/lib/history');
    expect((await afterReload.fetchSnowfallHistory(RESORT, 'upper', 5)).seasons[0].complete).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const corrupt = JSON.parse(persisted);
    corrupt[0].response.daily_units.snowfall_sum = 'inch';
    storage.set('powder-history-v1', JSON.stringify(corrupt));
    vi.resetModules();
    const corruptedReload = await import('../src/lib/history');
    expect((await corruptedReload.fetchSnowfallHistory(RESORT, 'upper', 5)).sourceKind).toBe('estimate');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('limits persistent payloads and removes the oldest entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response() }));
    for (let index = 0; index <= HISTORY_CACHE_MAX_ENTRIES; index++) {
      vi.setSystemTime(new Date(NOW.getTime() + index));
      await fetchSnowfallHistory({ ...RESORT, id: `resort-${index}` }, 'upper', 5);
    }
    const entries = JSON.parse(storage.get('powder-history-v1')!);
    expect(entries).toHaveLength(HISTORY_CACHE_MAX_ENTRIES);
    expect(entries.some((entry: { key: string }) => entry.key.includes(':resort-0:'))).toBe(false);
  });
  it('rejects an already aborted consumer before starting a request', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController(); controller.abort();
    await expect(fetchSnowfallHistory(RESORT, 'upper', 5, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('cancels provider work when the history dialog closes and does not write a late result', async () => {
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
    })); vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const pending = fetchSnowfallHistory(RESORT, 'upper', 5, controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await assertion;
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(storage.has('powder-history-v1')).toBe(false);
  });
  it('reports a bounded timeout with an actionable error and aborts the provider request', async () => {
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
    })); vi.stubGlobal('fetch', fetchMock);
    const pending = fetchSnowfallHistory(RESORT, 'upper', 5);
    const assertion = expect(pending).rejects.toThrow(/took too long/);
    await vi.advanceTimersByTimeAsync(HISTORY_REQUEST_TIMEOUT_MS); await assertion;
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
  });
  it('a cache reset prevents an older request from repopulating cleared history', async () => {
    let resolve: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(new Promise((done) => { resolve = done; })); vi.stubGlobal('fetch', fetchMock);
    const pending = fetchSnowfallHistory(RESORT, 'upper', 5);
    clearHistoryCache();
    resolve({ ok: true, json: async () => response() });
    await pending;
    expect(storage.has('powder-history-v1')).toBe(false);
  });
});
