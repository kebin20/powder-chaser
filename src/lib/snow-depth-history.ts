import type { Elevation, Resort } from '../types';
import { getCompletedSeasonWindows, type HistoryRange } from './history';
import { addDays, japanDate } from './dates';

export interface DailySnowDepth {
  date: string;
  depthCm: number | null;
}

export interface SeasonSnowDepth {
  season: string;
  startDate: string;
  endDate: string;
  expectedDays: number;
  availableDays: number;
  days: DailySnowDepth[];
}

export interface SnowDepthHistory {
  resortId: string;
  elevation: Elevation;
  elevationM: number | null;
  sourceName: string;
  sourceUrl: string;
  retrievedAt: string;
  seasons: SeasonSnowDepth[];
  warnings: string[];
}

const SOURCE_URL = 'https://open-meteo.com/en/docs/historical-weather-api';
const CACHE_VERSION = 'powder-snow-depth-v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 4;
const REQUEST_TIMEOUT_MS = 25_000;
const DAY_MS = 86_400_000;
interface CacheEntry { key: string; storedAt: number; data: SnowDepthHistory }
const memoryCache = new Map<string, CacheEntry>();
let cacheHydrated = false;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSelection(resort: Resort, elevation: Elevation) {
  if (elevation !== 'base' && elevation !== 'upper') throw new Error('Choose base or upper mountain.');
  if (!resort.id || !Number.isFinite(resort.latitude) || !Number.isFinite(resort.longitude)
    || resort.latitude < 24 || resort.latitude > 46 || resort.longitude < 122 || resort.longitude > 146) {
    throw new Error('Choose a supported resort in Japan.');
  }
  const meters = elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM;
  if (meters !== null && (!Number.isFinite(meters) || meters < 0 || meters > 4000)) {
    throw new Error('Invalid history elevation.');
  }
  return meters;
}

function cacheKey(resort: Resort, elevation: Elevation, range: HistoryRange, now: Date) {
  const meters = validateSelection(resort, elevation);
  const windows = getCompletedSeasonWindows(range, now);
  return `${CACHE_VERSION}:${resort.id}:${resort.latitude}:${resort.longitude}:${meters ?? 'auto'}:${range}:${windows.at(-1)!.season}`;
}

export function buildSnowDepthHistoryUrl(resort: Resort, elevation: Elevation, range: HistoryRange, now = new Date()): string {
  const meters = validateSelection(resort, elevation);
  const windows = getCompletedSeasonWindows(range, now);
  const availableThrough = addDays(japanDate(now), -6);
  const parameters = new URLSearchParams({
    latitude: String(resort.latitude), longitude: String(resort.longitude),
    start_date: windows[0].startDate,
    end_date: windows.at(-1)!.endDate < availableThrough ? windows.at(-1)!.endDate : availableThrough,
    hourly: 'snow_depth', models: 'era5_land', timezone: 'Asia/Tokyo', cell_selection: 'land',
  });
  if (meters !== null) parameters.set('elevation', String(meters));
  return `https://archive-api.open-meteo.com/v1/archive?${parameters}`;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function datesInWindow(start: string, end: string) {
  const count = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

export function parseSnowDepthHistoryResponse(
  response: unknown, resort: Resort, elevation: Elevation, range: HistoryRange,
  retrievedAt = new Date().toISOString(), now = new Date(),
): SnowDepthHistory {
  const meters = validateSelection(resort, elevation);
  const windows = getCompletedSeasonWindows(range, now);
  if (!record(response) || response.error || !record(response.hourly) || !record(response.hourly_units)
    || !Array.isArray(response.hourly.time) || !Array.isArray(response.hourly.snow_depth)
    || response.hourly.time.length !== response.hourly.snow_depth.length
    || response.hourly.time.length === 0 || response.hourly.time.length > 90_000) {
    throw new Error('The history service returned unreadable snow-depth data. Please try again.');
  }
  if (response.hourly_units.snow_depth !== 'm') throw new Error('The history service returned unexpected snow-depth units.');
  if (response.timezone !== 'Asia/Tokyo' || response.utc_offset_seconds !== 32400) {
    throw new Error('The history service returned an unexpected time zone.');
  }

  // Resort reports are commonly taken in the morning, so compare the modelled
  // snowpack at one consistent local time rather than a daily snowfall sum.
  const byDate = new Map<string, number | null>();
  const duplicates = new Set<string>();
  for (const [index, time] of response.hourly.time.entries()) {
    if (typeof time !== 'string' || time.slice(11, 16) !== '09:00') continue;
    const date = time.slice(0, 10);
    if (!validDate(date)) continue;
    if (byDate.has(date)) duplicates.add(date);
    const value: unknown = response.hourly.snow_depth[index];
    byDate.set(date, typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Number((value * 100).toFixed(1)) : null);
  }
  for (const date of duplicates) byDate.set(date, null);

  const seasons = windows.map((window): SeasonSnowDepth => {
    const dates = datesInWindow(window.startDate, window.endDate);
    const days = dates.map(date => ({ date, depthCm: byDate.get(date) ?? null }));
    return {
      ...window, days, expectedDays: dates.length,
      availableDays: days.filter(day => day.depthCm !== null).length,
    };
  });
  const warnings = [
    'ERA5-Land reanalysis estimates snow depth at an approximately 11 km grid; it cannot resolve individual pistes or match a resort station.',
    'Open-Meteo notes that ERA5-Land snow depth can be overestimated. Treat this as a broad winter comparison, not a resort observation.',
  ];
  if (meters === null) warnings.push('No reference elevation is mapped for this resort. The estimate uses the provider’s grid elevation.');
  if (seasons.some(season => season.availableDays < season.expectedDays)) {
    warnings.push('Missing morning values are shown as gaps; they are not treated as zero snow depth.');
  }
  return {
    resortId: resort.id, elevation, elevationM: meters,
    sourceName: 'Open-Meteo · ERA5-Land reanalysis', sourceUrl: SOURCE_URL,
    retrievedAt, seasons, warnings,
  };
}

function validCachedData(value: unknown): value is SnowDepthHistory {
  if (!record(value) || typeof value.resortId !== 'string' || !value.resortId
    || (value.elevation !== 'base' && value.elevation !== 'upper')
    || (value.elevationM !== null && (typeof value.elevationM !== 'number' || !Number.isFinite(value.elevationM)))
    || value.sourceName !== 'Open-Meteo · ERA5-Land reanalysis' || value.sourceUrl !== SOURCE_URL
    || typeof value.retrievedAt !== 'string' || !Array.isArray(value.seasons) || value.seasons.length < 5 || value.seasons.length > 10
    || !Array.isArray(value.warnings)) return false;
  return value.seasons.every(season => record(season)
    && typeof season.season === 'string' && /^\d{4}\/\d{2}$/.test(season.season)
    && validDate(season.startDate) && validDate(season.endDate)
    && typeof season.expectedDays === 'number' && season.expectedDays >= 181 && season.expectedDays <= 182
    && typeof season.availableDays === 'number' && season.availableDays >= 0 && season.availableDays <= season.expectedDays
    && Array.isArray(season.days) && season.days.length === season.expectedDays
    && season.days.every(day => record(day) && validDate(day.date)
      && (day.depthCm === null || (typeof day.depthCm === 'number' && Number.isFinite(day.depthCm) && day.depthCm >= 0))));
}

function pruneCache(now: number) {
  for (const [key, entry] of memoryCache) {
    if (entry.storedAt > now || now - entry.storedAt >= CACHE_TTL_MS) memoryCache.delete(key);
  }
  while (memoryCache.size > CACHE_MAX_ENTRIES) {
    const oldest = [...memoryCache.values()].sort((a, b) => a.storedAt - b.storedAt)[0];
    if (oldest) memoryCache.delete(oldest.key);
  }
}

function hydrateCache(now: number) {
  if (cacheHydrated) return;
  cacheHydrated = true;
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_VERSION);
    const entries: unknown = raw && raw.length <= 900_000 ? JSON.parse(raw) : null;
    if (Array.isArray(entries)) {
      for (const value of entries.slice(-CACHE_MAX_ENTRIES)) {
        if (record(value) && typeof value.key === 'string' && value.key.startsWith(`${CACHE_VERSION}:`)
          && typeof value.storedAt === 'number' && Number.isFinite(value.storedAt)
          && value.storedAt <= now && now - value.storedAt < CACHE_TTL_MS && validCachedData(value.data)) {
          memoryCache.set(value.key, { key: value.key, storedAt: value.storedAt, data: value.data });
        }
      }
    }
  } catch { /* History remains available when browser storage is blocked. */ }
  pruneCache(now);
}

function readCache(key: string, now: number) {
  hydrateCache(now);
  return memoryCache.get(key);
}

function writeCache(entry: CacheEntry) {
  memoryCache.set(entry.key, entry);
  pruneCache(Date.now());
  try { globalThis.localStorage?.setItem(CACHE_VERSION, JSON.stringify([...memoryCache.values()])); }
  catch { /* Storage is optional; the in-memory result is still useful. */ }
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Request cancelled', 'AbortError');
}

/** Load one selected resort only; the app never requests all Japan locations. */
export async function fetchSnowDepthHistory(
  resort: Resort, elevation: Elevation, range: HistoryRange, signal?: AbortSignal,
): Promise<SnowDepthHistory> {
  checkAbort(signal);
  validateSelection(resort, elevation);
  const now = new Date();
  const key = cacheKey(resort, elevation, range, now);
  const cached = readCache(key, now.getTime());
  if (cached) return { ...cached.data, elevation, elevationM: validateSelection(resort, elevation) };

  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason ?? new DOMException('Request cancelled', 'AbortError'));
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('History request timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(buildSnowDepthHistoryUrl(resort, elevation, range, now), { signal: controller.signal });
    checkAbort(controller.signal);
    if (!response.ok) throw new Error(`The history service could not load snow depth (HTTP ${response.status}). Please try again.`);
    const payload: unknown = await response.json();
    checkAbort(controller.signal);
    const retrievedAt = new Date().toISOString();
    const data = parseSnowDepthHistoryResponse(payload, resort, elevation, range, retrievedAt, now);
    // Complete daily series are safe to keep for a week. Incomplete data stays
    // available in the open view but is fetched again next time.
    if (data.seasons.every(season => season.availableDays === season.expectedDays)) {
      writeCache({ key, storedAt: Date.now(), data });
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted) {
      if (controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError') {
        throw new Error('The history service took too long to respond. Please try again.');
      }
      checkAbort(signal);
    }
    if (error instanceof TypeError) throw new Error('Snow-depth history could not be reached. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
