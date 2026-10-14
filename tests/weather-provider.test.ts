import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESORTS } from '../src/data/resorts';
import { WEATHER_MODELS } from '../src/data/providers';
import { addDays, getTripDates, japanDate, overnightHourEnds, overnightWindow } from '../src/lib/dates';
import {
  buildForecastUrl, clearWeatherCache, fetchLiveSnapshot, parseForecastResponse,
  WEATHER_CACHE_MAX_ENTRIES, WEATHER_CACHE_TTL_MS,
} from '../src/lib/weather';

const NOW = new Date('2026-01-20T12:00:00Z');
const DATE = '2026-01-21';
const RESORT = RESORTS[0];

function providerResponse(date = DATE) {
  const times = [`${addDays(date, -1)}T18:00`, ...overnightHourEnds(date), `${date}T09:00`];
  const hourly: Record<string, unknown[]> = { time: times };
  const hourly_units: Record<string, string> = { time: 'iso8601' };
  for (const model of WEATHER_MODELS) {
    for (const [variable, unit, value] of [
      ['snowfall', 'cm', 2], ['temperature_2m', '°C', -5],
      ['wind_speed_10m', 'km/h', 20], ['rain', 'mm', 0],
    ] as const) {
      const key = `${variable}_${model.id}`;
      hourly[key] = times.map((_, index) => variable === 'snowfall' && (index === 0 || index === 15) ? 999 : value);
      hourly_units[key] = unit;
    }
  }
  return { timezone: 'Asia/Tokyo', utc_offset_seconds: 32400, hourly, hourly_units, generationtime_ms: 2.1 };
}

describe('JST trip windows', () => {
  it('uses the Japan date across a UTC day/year boundary', () => {
    const now = new Date('2025-12-31T16:00:00Z');
    expect(japanDate(now)).toBe('2026-01-01');
    expect(getTripDates(now).map((date) => date.date)).toEqual(['2026-01-02', '2026-01-03']);
  });

  it('sums hour ends in (18:00,08:00], crossing midnight and the year boundary', () => {
    expect(overnightWindow('2026-01-01').start).toBe('2025-12-31T18:00:00+09:00');
    const hours = overnightHourEnds('2026-01-01');
    expect(hours).toHaveLength(14);
    expect(hours[0]).toBe('2025-12-31T19:00');
    expect(hours[13]).toBe('2026-01-01T08:00');
  });
});

describe('provider response normalization', () => {
  it('aligns all three models to the same 14-hour snow window and preserves retrieval provenance', () => {
    const snapshot = parseForecastResponse(providerResponse(), RESORT, DATE, 'upper', NOW.toISOString());
    expect(snapshot.models).toHaveLength(3);
    expect(snapshot.models.map((model) => model.snowfallCm)).toEqual([28, 28, 28]);
    expect(snapshot.models[0].updatedAt).toBe(NOW.toISOString());
    expect(snapshot.models[0].issuedAt).toBeNull();
    expect(snapshot.report.depthCm).toBeNull();
    expect(snapshot.report.snowfall24hCm).toBeNull();
    expect(snapshot.report.fictional).toBe(false);
    expect(snapshot.operations.status).toBe('unknown');
    expect(snapshot.operations.verifiedForDate).toBeNull();
  });

  it('does not turn a null hour, missing model or wrong unit into zero snow', () => {
    const response = providerResponse();
    response.hourly.snowfall_jma_msm[4] = null;
    delete response.hourly.snowfall_ecmwf_ifs025;
    response.hourly_units.snowfall_gfs_global = 'inch';
    const snapshot = parseForecastResponse(response, RESORT, DATE, 'upper');
    expect(snapshot.models.every((model) => !model.complete && model.snowfallCm === null)).toBe(true);
    expect(snapshot.typicalCm).toBeNull();
  });

  it('a missing or duplicate timestamp invalidates totals for the expected window', () => {
    const missing = providerResponse();
    missing.hourly.time[6] = `${DATE}T10:00`;
    expect(parseForecastResponse(missing, RESORT, DATE, 'upper').models[0].snowfallCm).toBeNull();
    const duplicate = providerResponse();
    duplicate.hourly.time.push(duplicate.hourly.time[1]);
    expect(parseForecastResponse(duplicate, RESORT, DATE, 'upper').models[0].complete).toBe(false);
  });

  it('retains a genuine zero forecast and uses maximum overnight temperature/wind', () => {
    const response = providerResponse();
    response.hourly.snowfall_jma_msm = response.hourly.time.map(() => 0);
    response.hourly.temperature_2m_jma_msm[4] = 2;
    response.hourly.wind_speed_10m_jma_msm[4] = 48;
    const model = parseForecastResponse(response, RESORT, DATE, 'base').models[0];
    expect(model.snowfallCm).toBe(0);
    expect(model.complete).toBe(true);
    expect(model.tempC).toBe(2);
    expect(model.windKph).toBe(48);
  });

  it('rejects unusable payloads and an incorrect time zone', () => {
    expect(() => parseForecastResponse({ error: true }, RESORT, DATE, 'upper')).toThrow(/unreadable/);
    const response = providerResponse();
    response.utc_offset_seconds = 0;
    expect(() => parseForecastResponse(response, RESORT, DATE, 'upper')).toThrow(/time zone/);
  });
});

describe('live request and cache behavior', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    clearWeatherCache();
  });
  afterEach(() => {
    clearWeatherCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const successfulFetch = () => vi.fn().mockImplementation(async () => ({
    ok: true, json: async () => providerResponse(),
  }));

  it('requests explicit models, Japan time and the selected reference elevation', () => {
    const url = new URL(buildForecastUrl(RESORT, DATE, 'upper', NOW));
    expect(url.searchParams.get('models')).toBe('jma_msm,ecmwf_ifs025,gfs_global');
    expect(url.searchParams.get('timezone')).toBe('Asia/Tokyo');
    expect(url.searchParams.get('elevation')).toBe(String(RESORT.upperElevationM));
    expect(url.searchParams.get('forecast_days')).toBe('3');
    expect(() => buildForecastUrl(RESORT, '2026-01-30', 'upper', NOW)).toThrow(/next two/);
  });

  it('reuses fresh cache, distinguishes elevation/date, and expires after 45 minutes', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const initial = await fetchLiveSnapshot(RESORT, DATE, 'upper');
    await fetchLiveSnapshot(RESORT, DATE, 'upper');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchLiveSnapshot(RESORT, DATE, 'base');
    await fetchLiveSnapshot(RESORT, '2026-01-22', 'upper');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.setSystemTime(new Date(NOW.getTime() + WEATHER_CACHE_TTL_MS));
    const refreshed = await fetchLiveSnapshot(RESORT, DATE, 'upper');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(refreshed.updatedAt).not.toBe(initial.updatedAt);
  });

  it('keeps browser cache bounded', async () => {
    vi.stubGlobal('fetch', successfulFetch());
    for (let index = 0; index < WEATHER_CACHE_MAX_ENTRIES + 3; index++) {
      await fetchLiveSnapshot({ ...RESORT, id: `test-resort-${index}` }, DATE, 'upper');
    }
    const entries = JSON.parse([...storage.values()][0]) as unknown[];
    expect(entries).toHaveLength(WEATHER_CACHE_MAX_ENTRIES);
  });

  it('rejects a pre-cancelled request even when a cache entry exists', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    await fetchLiveSnapshot(RESORT, DATE, 'upper');
    const controller = new AbortController();
    controller.abort();
    await expect(fetchLiveSnapshot(RESORT, DATE, 'upper', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the underlying fetch and never caches cancelled work', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, options: { signal: AbortSignal }) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const request = fetchLiveSnapshot(RESORT, DATE, 'upper', controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(storage.size).toBe(0);
  });

  it('does not substitute fictional conditions after a live failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchLiveSnapshot(RESORT, DATE, 'upper')).rejects.toThrow(/HTTP 503/);
    expect(storage.size).toBe(0);
  });

  it('expires a slow request and never stores a late result', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, options: { signal: AbortSignal }) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const request = fetchLiveSnapshot(RESORT, DATE, 'upper');
    const assertion = expect(request).rejects.toThrow(/too long/);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(storage.size).toBe(0);
  });
});
