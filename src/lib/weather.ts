import type { DataMode, Elevation, ForecastModel, Resort, WeatherSnapshot } from '../types';
import { getDemoSnapshot } from '../data/demo';
import { WEATHER_MODELS } from '../data/providers';
import { addDays, japanDate, overnightHourEnds } from './dates';
import { assembleSnapshot } from './snapshot';

export const WEATHER_CACHE_TTL_MS = 45 * 60 * 1000;
export const WEATHER_CACHE_MAX_ENTRIES = 32;
const CACHE_VERSION = 'powder-weather-v1';
const REQUEST_TIMEOUT_MS = 15_000;
interface CacheEntry { key: string; storedAt: number; response: unknown }
const memoryCache = new Map<string, CacheEntry>();

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Request cancelled', 'AbortError');
}

function validateSelection(resort: Resort, date: string, elevation: Elevation, now: Date) {
  if (elevation !== 'base' && elevation !== 'upper') throw new Error('Choose base or upper mountain.');
  const today = japanDate(now);
  if (date !== addDays(today, 1) && date !== addDays(today, 2)) {
    throw new Error('Live forecasts support the next two mornings in Japan. Refresh the trip dates.');
  }
  if (!resort.id || !Number.isFinite(resort.latitude) || !Number.isFinite(resort.longitude)
    || resort.latitude < 24 || resort.latitude > 46 || resort.longitude < 122 || resort.longitude > 146) {
    throw new Error('Choose a supported resort in Japan.');
  }
  const meters = elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM;
  if (!Number.isFinite(meters) || meters < 0 || meters > 4000) throw new Error('Invalid forecast elevation.');
}

export function buildForecastUrl(resort: Resort, date: string, elevation: Elevation, now = new Date()): string {
  validateSelection(resort, date, elevation, now);
  const parameters = new URLSearchParams({
    latitude: String(resort.latitude), longitude: String(resort.longitude),
    elevation: String(elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM),
    models: WEATHER_MODELS.map((model) => model.id).join(','),
    hourly: 'snowfall,temperature_2m,wind_speed_10m,rain',
    timezone: 'Asia/Tokyo', forecast_days: '3',
    temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm',
  });
  return `https://api.open-meteo.com/v1/forecast?${parameters}`;
}

/** No zero fill: every preceding-hour snow/rain sum requires all 14 expected hours. */
export function parseForecastResponse(
  response: unknown, resort: Resort, date: string, elevation: Elevation,
  retrievedAt = new Date().toISOString(),
): WeatherSnapshot {
  if (!record(response) || response.error || !record(response.hourly)
    || !Array.isArray(response.hourly.time) || !record(response.hourly_units)) {
    throw new Error('The weather service returned an unreadable forecast. Please try again.');
  }
  if (response.utc_offset_seconds !== 32400 || response.timezone !== 'Asia/Tokyo') {
    throw new Error('The weather service returned an unexpected time zone. Please try again.');
  }
  const hourly = response.hourly;
  const units = response.hourly_units;
  const timeIndices = new Map<string, number>();
  const duplicates = new Set<string>();
  for (const [index, time] of (hourly.time as unknown[]).entries()) {
    if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:00(?::00)?$/.test(time)) continue;
    const key = time.slice(0, 16);
    if (timeIndices.has(key)) duplicates.add(key);
    timeIndices.set(key, index);
  }
  const indices = overnightHourEnds(date).map((time) => duplicates.has(time) ? undefined : timeIndices.get(time));
  const warnings: string[] = [];
  const models: ForecastModel[] = WEATHER_MODELS.map((provider) => {
    const values = (variable: string, unit: string, nonNegative: boolean): number[] | null => {
      const key = `${variable}_${provider.id}`;
      const series = hourly[key];
      if (!Array.isArray(series) || units[key] !== unit) return null;
      const selected: number[] = [];
      for (const index of indices) {
        const value: unknown = index === undefined ? null : series[index];
        if (typeof value !== 'number' || !Number.isFinite(value) || (nonNegative && value < 0)) return null;
        selected.push(value);
      }
      return selected;
    };
    const snow = values('snowfall', 'cm', true);
    const rain = values('rain', 'mm', true);
    const temperature = values('temperature_2m', '°C', false);
    const wind = values('wind_speed_10m', 'km/h', true);
    const sum = (series: number[] | null) => series === null ? null : Number(series.reduce((a, b) => a + b, 0).toFixed(1));
    const maximum = (series: number[] | null) => series === null ? null : Math.max(...series);
    if (!snow) warnings.push(`${provider.label}: the overnight snowfall window is incomplete.`);
    if (!temperature || !wind || !rain) warnings.push(`${provider.label}: some snow-quality data is unavailable.`);
    return {
      ...provider, snowfallCm: sum(snow), rainMm: sum(rain),
      tempC: maximum(temperature), windKph: maximum(wind),
      complete: snow !== null, updatedAt: retrievedAt,
      // generationtime_ms is server processing duration, not a model issue timestamp.
      issuedAt: null,
    };
  });
  warnings.push('Official resort snow and lift reports are not connected. Confirm access on the resort website.');
  return assembleSnapshot('live', resort, date, elevation, models, {
    snowfall24hCm: null, depthCm: null, location: 'Official reporting station not connected',
    updatedAt: null, sourceUrl: resort.officialReportUrl, fictional: false,
  }, {
    status: 'unknown', verifiedForDate: null,
    details: 'Trip-date lift and terrain access is unverified. Check the official report.', updatedAt: null,
  }, retrievedAt, warnings);
}

function cacheKey(resort: Resort, date: string, elevation: Elevation): string {
  const meters = elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM;
  return `${CACHE_VERSION}:${resort.id}:${resort.latitude}:${resort.longitude}:${date}:${elevation}:${meters}`;
}

function pruneCache(now: number) {
  for (const [key, entry] of memoryCache) {
    if (entry.storedAt > now || now - entry.storedAt >= WEATHER_CACHE_TTL_MS) memoryCache.delete(key);
  }
  while (memoryCache.size > WEATHER_CACHE_MAX_ENTRIES) {
    const oldest = [...memoryCache.values()].sort((a, b) => a.storedAt - b.storedAt)[0];
    if (oldest) memoryCache.delete(oldest.key);
  }
}

function readCache(key: string, now: number): CacheEntry | undefined {
  pruneCache(now);
  const memory = memoryCache.get(key);
  if (memory) return memory;
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_VERSION);
    const entries: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(entries)) {
      // Re-parse the payload before use; browser storage is never a trusted snapshot.
      for (const value of entries.slice(-WEATHER_CACHE_MAX_ENTRIES)) {
        if (record(value) && typeof value.key === 'string' && value.key.startsWith(`${CACHE_VERSION}:`)
          && typeof value.storedAt === 'number' && Number.isFinite(value.storedAt)
          && value.storedAt <= now && now - value.storedAt < WEATHER_CACHE_TTL_MS) {
          memoryCache.set(value.key, { key: value.key, storedAt: value.storedAt, response: value.response });
        }
      }
    }
  } catch { /* Cache is optional when storage is denied or full. */ }
  pruneCache(now);
  return memoryCache.get(key);
}

function writeCache(entry: CacheEntry) {
  memoryCache.set(entry.key, entry);
  pruneCache(Date.now());
  try {
    globalThis.localStorage?.setItem(CACHE_VERSION, JSON.stringify([...memoryCache.values()]));
  } catch { /* Live forecasts still work when storage is unavailable. */ }
}

export function clearWeatherCache() {
  memoryCache.clear();
  try { globalThis.localStorage?.removeItem(CACHE_VERSION); } catch { /* Optional storage. */ }
}

export async function fetchLiveSnapshot(
  resort: Resort, date: string, elevation: Elevation, signal?: AbortSignal,
): Promise<WeatherSnapshot> {
  checkAbort(signal);
  const now = new Date();
  const url = buildForecastUrl(resort, date, elevation, now);
  const key = cacheKey(resort, date, elevation);
  const cached = readCache(key, now.getTime());
  if (cached) {
    try {
      const snapshot = parseForecastResponse(cached.response, resort, date, elevation, new Date(cached.storedAt).toISOString());
      checkAbort(signal);
      return snapshot;
    } catch (error) {
      checkAbort(signal);
      memoryCache.delete(key);
      // An invalid cache is discarded; the actual provider is queried next.
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
    }
  }
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Weather request timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  try {
    checkAbort(signal);
    const result = await fetch(url, { signal: controller.signal });
    checkAbort(signal);
    checkAbort(controller.signal);
    if (!result.ok) throw new Error(`The weather service could not load forecasts (HTTP ${result.status}). Please try again.`);
    const response: unknown = await result.json();
    checkAbort(signal);
    checkAbort(controller.signal);
    const storedAt = Date.now();
    const snapshot = parseForecastResponse(response, resort, date, elevation, new Date(storedAt).toISOString());
    writeCache({ key, storedAt, response });
    return snapshot;
  } catch (error) {
    checkAbort(signal);
    if (controller.signal.aborted) throw new Error('The weather service took too long to respond. Please try again.');
    if (error instanceof TypeError) throw new Error('The weather service could not be reached. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function getWeatherSnapshot(
  resort: Resort, date: string, elevation: Elevation, mode: DataMode, signal?: AbortSignal,
): Promise<WeatherSnapshot> {
  checkAbort(signal);
  return mode === 'demo' ? getDemoSnapshot(resort, date, elevation) : fetchLiveSnapshot(resort, date, elevation, signal);
}
