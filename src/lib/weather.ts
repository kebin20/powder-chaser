import type { DataMode, Elevation, ForecastModel, Resort, WeatherSnapshot } from '../types';
import { getDemoSnapshot, type DemoScenarioId } from '../data/demo';
import { WEATHER_MODELS } from '../data/providers';
import { addDays, japanDate, overnightHourEnds } from './dates';
import { assembleSnapshot } from './snapshot';

export const WEATHER_CACHE_TTL_MS = 45 * 60 * 1000;
export const WEATHER_CACHE_MAX_ENTRIES = 32;
const CACHE_VERSION = 'powder-weather-v4';
const STORAGE_KEY = `${CACHE_VERSION}:${import.meta.env.BASE_URL}`;
const MODEL_IDS = WEATHER_MODELS.map((model) => model.id).join(',');
const REQUEST_TIMEOUT_MS = 15_000;
interface CacheEntry { key: string; queryDay: string; storedAt: number; response: unknown }
interface PendingRequest {
  controller: AbortController;
  consumers: Set<symbol>;
  settled: boolean;
  promise: Promise<CacheEntry>;
}
const memoryCache = new Map<string, CacheEntry>();
const persistentKeys = new Set<string>();
let storageLoaded = false;
const pendingRequests = new Map<string, PendingRequest>();
let cacheGeneration = 0;

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
  if (meters !== null && (!Number.isFinite(meters) || meters < 0 || meters > 4000)) throw new Error('Invalid forecast elevation.');
}

export function buildForecastUrl(resort: Resort, date: string, elevation: Elevation, now = new Date()): string {
  validateSelection(resort, date, elevation, now);
  const today = japanDate(now);
  const parameters = new URLSearchParams({
    latitude: String(resort.latitude), longitude: String(resort.longitude),
    models: MODEL_IDS,
    hourly: 'snowfall,temperature_2m,wind_speed_10m,rain',
    // Both overnight windows fit 38 hourly samples. The first sample at 19:00
    // contains snowfall for 18:00–19:00; the final one ends at 08:00 on day two.
    timezone: 'Asia/Tokyo', start_hour: `${today}T19:00`, end_hour: `${addDays(today, 2)}T08:00`,
    temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm',
  });
  const meters = elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM;
  // Unknown terrain height uses the provider's default location grid. Do not
  // invent an upper/base altitude from a different station or mountain.
  if (meters !== null) parameters.set('elevation', String(meters));
  return `https://api.open-meteo.com/v1/forecast?${parameters}`;
}

function providerFields(response: unknown) {
  if (!record(response) || response.error || !record(response.hourly)
    || !Array.isArray(response.hourly.time) || !record(response.hourly_units)) {
    throw new Error('The weather service returned an unreadable forecast. Please try again.');
  }
  if (response.utc_offset_seconds !== 32400 || response.timezone !== 'Asia/Tokyo') {
    throw new Error('The weather service returned an unexpected time zone. Please try again.');
  }
  return { hourly: response.hourly, units: response.hourly_units };
}

/** No zero fill: every preceding-hour snow/rain sum requires all 14 expected hours. */
function providerWindow(response: unknown, date: string, retrievedAt: string) {
  const { hourly, units } = providerFields(response);
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
  return { models, warnings };
}

export function parseForecastResponse(
  response: unknown, resort: Resort, date: string, elevation: Elevation,
  retrievedAt = new Date().toISOString(),
): WeatherSnapshot {
  const { models, warnings } = providerWindow(response, date, retrievedAt);
  warnings.push('Lift and terrain access for your ski date is unverified. Check the morning resort check and official website.');
  return assembleSnapshot('live', resort, date, elevation, models, {
    snowfall24hCm: null, depthCm: null, location: 'No observation is assigned to this forecast height',
    updatedAt: null, sourceUrl: resort.officialReportUrl, fictional: false,
  }, {
    status: 'unknown', verifiedForDate: null,
    details: 'Trip-date lift and terrain access is unverified. Check the official report.', updatedAt: null,
  }, retrievedAt, warnings);
}

/** Both ski mornings come from one bounded payload; the query day bounds reuse. */
function cacheKey(resort: Resort, queryDay: string, elevation: Elevation): string {
  const meters = elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM;
  return JSON.stringify([resort.id, resort.latitude, resort.longitude, queryDay, meters ?? 'auto', MODEL_IDS]);
}

function validStoredKey(key: string, queryDay: string): boolean {
  try {
    const parts: unknown = JSON.parse(key);
    if (!Array.isArray(parts) || parts.length !== 6) return false;
    const [id, latitude, longitude, day, meters, models] = parts;
    return typeof id === 'string' && id.length > 0
      && typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= 24 && latitude <= 46
      && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= 122 && longitude <= 146
      && day === queryDay && models === MODEL_IDS
      && (meters === 'auto' || (typeof meters === 'number' && Number.isFinite(meters) && meters >= 0 && meters <= 4000));
  } catch { return false; }
}

/** Incomplete forecasts may be useful in memory, but should not survive a reload. */
function completePayload(entry: CacheEntry): boolean {
  try {
    return [1, 2].every((days) => providerWindow(
      entry.response, addDays(entry.queryDay, days), new Date(entry.storedAt).toISOString(),
    ).models.every((model) => model.complete && model.rainMm !== null && model.tempC !== null && model.windKph !== null));
  } catch { return false; }
}

function pruneCache(now: number) {
  const queryDay = japanDate(new Date(now));
  for (const [key, entry] of memoryCache) {
    if (entry.queryDay !== queryDay || entry.storedAt > now || now - entry.storedAt >= WEATHER_CACHE_TTL_MS) {
      memoryCache.delete(key);
      persistentKeys.delete(key);
    }
  }
  while (memoryCache.size > WEATHER_CACHE_MAX_ENTRIES) {
    const oldest = [...memoryCache.values()].sort((a, b) => a.storedAt - b.storedAt)[0];
    if (oldest) {
      memoryCache.delete(oldest.key);
      persistentKeys.delete(oldest.key);
    }
  }
}

function readCache(key: string, now: number): CacheEntry | undefined {
  pruneCache(now);
  if (!storageLoaded) {
    storageLoaded = true;
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      const entries: unknown = raw ? JSON.parse(raw) : null;
      const queryDay = japanDate(new Date(now));
      if (Array.isArray(entries)) {
        for (const value of entries.slice(-WEATHER_CACHE_MAX_ENTRIES)) {
          if (record(value) && typeof value.key === 'string' && value.queryDay === queryDay
            && validStoredKey(value.key, queryDay) && typeof value.storedAt === 'number' && Number.isFinite(value.storedAt)
            && value.storedAt <= now && now - value.storedAt < WEATHER_CACHE_TTL_MS) {
            const entry = { key: value.key, queryDay, storedAt: value.storedAt, response: value.response };
            // Validate both ski mornings, every model and units before restoring.
            if (completePayload(entry)) {
              memoryCache.set(entry.key, entry);
              persistentKeys.add(entry.key);
            }
          }
        }
      }
    } catch { /* Cache is optional when storage is denied or unreadable. */ }
    pruneCache(now);
  }
  return memoryCache.get(key);
}

function writeCache(entry: CacheEntry) {
  memoryCache.set(entry.key, entry);
  if (completePayload(entry)) persistentKeys.add(entry.key);
  else persistentKeys.delete(entry.key);
  pruneCache(Date.now());
  try {
    const entries = [...memoryCache.values()].filter((value) => persistentKeys.has(value.key));
    if (entries.length) globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(entries));
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch { /* Live forecasts still work when storage is denied or full. */ }
}

export function clearWeatherCache() {
  cacheGeneration++;
  memoryCache.clear();
  persistentKeys.clear();
  storageLoaded = true;
  // Existing consumers may finish, but a manual refresh starts its own request
  // and an older request cannot repopulate the newly cleared cache.
  pendingRequests.clear();
  try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* Optional storage. */ }
}

async function fetchProviderPayload(
  key: string, url: string, queryDay: string, controller: AbortController, generation: number,
): Promise<CacheEntry> {
  const timer = setTimeout(() => controller.abort(new DOMException('Weather request timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  try {
    const result = await fetch(url, { signal: controller.signal });
    checkAbort(controller.signal);
    if (!result.ok) throw new Error(`The weather service could not load forecasts (HTTP ${result.status}). Please try again.`);
    const response: unknown = await result.json();
    checkAbort(controller.signal);
    const storedAt = Date.now();
    if (japanDate(new Date(storedAt)) !== queryDay) {
      throw new Error('The forecast date changed in Japan. Refresh the trip dates and try again.');
    }
    providerFields(response);
    const entry = { key, queryDay, storedAt, response };
    if (generation === cacheGeneration) writeCache(entry);
    return entry;
  } catch (error) {
    if (controller.signal.aborted) {
      if (controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError') {
        throw new Error('The weather service took too long to respond. Please try again.');
      }
      checkAbort(controller.signal);
    }
    if (error instanceof TypeError) throw new Error('The weather service could not be reached. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function consumeRequest(key: string, request: PendingRequest, signal?: AbortSignal): Promise<CacheEntry> {
  return new Promise((resolve, reject) => {
    const consumer = Symbol('weather consumer');
    let attached = true;
    request.consumers.add(consumer);
    const detach = () => {
      if (!attached) return;
      attached = false;
      signal?.removeEventListener('abort', cancel);
      request.consumers.delete(consumer);
      if (request.consumers.size === 0 && !request.settled) {
        if (pendingRequests.get(key) === request) pendingRequests.delete(key);
        request.controller.abort();
      }
    };
    const cancel = () => {
      detach();
      reject(signal?.reason ?? new DOMException('Request cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    request.promise.then((entry) => {
      if (!attached) return;
      detach();
      resolve(entry);
    }, (error: unknown) => {
      if (!attached) return;
      detach();
      reject(error);
    });
    if (signal?.aborted) cancel();
  });
}

export async function fetchLiveSnapshot(
  resort: Resort, date: string, elevation: Elevation, signal?: AbortSignal,
): Promise<WeatherSnapshot> {
  checkAbort(signal);
  const now = new Date();
  const url = buildForecastUrl(resort, date, elevation, now);
  const queryDay = japanDate(now);
  const key = cacheKey(resort, queryDay, elevation);
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
    }
  }
  let request = pendingRequests.get(key);
  if (!request) {
    const controller = new AbortController();
    request = {
      controller, consumers: new Set(), settled: false,
      promise: fetchProviderPayload(key, url, queryDay, controller, cacheGeneration),
    };
    pendingRequests.set(key, request);
    const createdRequest = request;
    const forget = () => {
      createdRequest.settled = true;
      if (pendingRequests.get(key) === createdRequest) pendingRequests.delete(key);
    };
    // Both outcomes are handled even when every consumer leaves early.
    void request.promise.then(forget, forget);
  }
  const entry = await consumeRequest(key, request, signal);
  checkAbort(signal);
  return parseForecastResponse(entry.response, resort, date, elevation, new Date(entry.storedAt).toISOString());
}

export async function getWeatherSnapshot(
  resort: Resort, date: string, elevation: Elevation, mode: DataMode, signal?: AbortSignal,
  demoScenario: DemoScenarioId = 'resort-default',
): Promise<WeatherSnapshot> {
  checkAbort(signal);
  return mode === 'demo' ? getDemoSnapshot(resort, date, elevation, new Date(), demoScenario) : fetchLiveSnapshot(resort, date, elevation, signal);
}
