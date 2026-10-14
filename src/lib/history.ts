import type { Elevation, Resort } from '../types';
import { addDays, japanDate } from './dates';

export type HistoryRange = 5 | 10;
export type HistorySourceKind = 'resort' | 'estimate';
export interface MonthlySnowfall {
  month: string;
  totalCm: number | null;
  complete: boolean;
}
export interface SeasonSnowfall {
  season: string;
  /** Exact observation dates are unknown for curated resort summaries. */
  startDate: string | null;
  endDate: string | null;
  totalCm: number | null;
  complete: boolean;
  availableDays: number;
  expectedDays: number;
  monthly: MonthlySnowfall[];
  sourceUrl: string | null;
  reportedAt: string | null;
  location: string | null;
  notes: string[];
}
export interface SnowfallHistory {
  resortId: string;
  elevation: Elevation;
  elevationM: number | null;
  sourceKind: HistorySourceKind;
  sourceName: string;
  sourceUrl: string;
  retrievedAt: string;
  windowLabel: string;
  seasons: SeasonSnowfall[];
  warnings: string[];
}
export interface SeasonWindow { season: string; startDate: string; endDate: string }

export const HISTORY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const HISTORY_CACHE_MAX_ENTRIES = 8;
export const HISTORY_REQUEST_TIMEOUT_MS = 25_000;
const CACHE_VERSION = 'powder-history-v1';
const HISTORY_DOCUMENTATION = 'https://open-meteo.com/en/docs/historical-weather-api';
const DAY_MS = 86_400_000;
interface CacheEntry { key: string; storedAt: number; response: unknown }
const memoryCache = new Map<string, CacheEntry>();
let cacheGeneration = 0;

/** Only completed November–April windows, with Japan's date deciding the boundary. */
export function getCompletedSeasonWindows(range: HistoryRange, now = new Date()): SeasonWindow[] {
  if (range !== 5 && range !== 10) throw new Error('Choose five or ten winter seasons.');
  const today = japanDate(now);
  const year = Number(today.slice(0, 4));
  const latestEndYear = today >= `${year}-05-01` ? year : year - 1;
  return Array.from({ length: range }, (_, index) => {
    const endYear = latestEndYear - range + index + 1;
    return {
      season: `${endYear - 1}/${String(endYear).slice(-2)}`,
      startDate: `${endYear - 1}-11-01`, endDate: `${endYear}-04-30`,
    };
  });
}

function validateSelection(resort: Resort, elevation: Elevation): number | null {
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

/** Pin one reanalysis model; Best Match can change models across the comparison. */
export function buildHistoryUrl(resort: Resort, elevation: Elevation, range: HistoryRange, now = new Date()): string {
  const meters = validateSelection(resort, elevation);
  const windows = getCompletedSeasonWindows(range, now);
  const end = windows[windows.length - 1].endDate;
  // ERA5 is published with a five-day delay. Missing final April days remain gaps.
  const availableThrough = addDays(japanDate(now), -6);
  const parameters = new URLSearchParams({
    latitude: String(resort.latitude), longitude: String(resort.longitude),
    start_date: windows[0].startDate, end_date: end < availableThrough ? end : availableThrough,
    daily: 'snowfall_sum', models: 'era5', timezone: 'Asia/Tokyo', precipitation_unit: 'mm',
  });
  if (meters !== null) parameters.set('elevation', String(meters));
  return `https://archive-api.open-meteo.com/v1/archive?${parameters}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Request cancelled', 'AbortError');
}
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function datesInWindow(start: string, end: string): string[] {
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
  return Array.from({ length: days }, (_, index) => addDays(start, index));
}

/** Missing, duplicate, null or invalid days never become zero snowfall. */
export function parseHistoryResponse(
  response: unknown, resort: Resort, elevation: Elevation, range: HistoryRange,
  retrievedAt = new Date().toISOString(), now = new Date(),
): SnowfallHistory {
  const meters = validateSelection(resort, elevation);
  const windows = getCompletedSeasonWindows(range, now);
  if (!record(response) || response.error || !record(response.daily) || !record(response.daily_units)
    || !Array.isArray(response.daily.time) || !Array.isArray(response.daily.snowfall_sum)
    || response.daily.time.length !== response.daily.snowfall_sum.length
    || response.daily.time.length === 0 || response.daily.time.length > 3662) {
    throw new Error('The history service returned unreadable snowfall data. Please try again.');
  }
  if (response.daily_units.snowfall_sum !== 'cm') throw new Error('The history service returned unexpected snowfall units.');
  if (response.timezone !== 'Asia/Tokyo' || response.utc_offset_seconds !== 32400) {
    throw new Error('The history service returned an unexpected time zone.');
  }
  const days = new Map<string, number | null>();
  const duplicates = new Set<string>();
  for (const [index, date] of response.daily.time.entries()) {
    if (!validDate(date)) throw new Error('The history service returned an invalid date.');
    if (days.has(date)) duplicates.add(date);
    const value: unknown = response.daily.snowfall_sum[index];
    days.set(date, typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);
  }
  for (const date of duplicates) days.set(date, null);
  const aggregate = (dates: string[]) => {
    const values = dates.map((date) => days.get(date));
    const availableDays = values.filter((value) => typeof value === 'number').length;
    const total = availableDays === dates.length ? (values as number[]).reduce((sum, value) => sum + value, 0) : null;
    const complete = total !== null && Number.isFinite(total);
    return {
      availableDays, complete,
      totalCm: complete ? Number(total!.toFixed(1)) : null,
    };
  };
  const seasons = windows.map((window): SeasonSnowfall => {
    const dates = datesInWindow(window.startDate, window.endDate);
    const result = aggregate(dates);
    const months = [...new Set(dates.map((date) => date.slice(0, 7)))];
    return {
      ...window, ...result, expectedDays: dates.length,
      monthly: months.map((month) => ({ month, ...aggregate(dates.filter((date) => date.startsWith(month))) })),
      sourceUrl: HISTORY_DOCUMENTATION, reportedAt: null,
      location: meters === null ? 'Resort area; mapped terrain elevation' : `${elevation === 'upper' ? 'Upper mountain' : 'Base'} reference · ${meters} m`,
      notes: result.complete ? [] : ['Some daily values are missing or invalid; a full-season total cannot be calculated.'],
    };
  });
  const warnings = [
    'Model estimates for this location, not resort observations. ERA5 uses a roughly 25 km grid and can miss local mountain snowfall.',
    'Totals add new snowfall across November–April; they are not snow depth, powder quality, or a prediction for your trip.',
  ];
  if (meters === null) warnings.push('This resort has no verified base or upper reference elevation. The provider uses mapped terrain elevation for the resort area.');
  if (seasons.some((season) => !season.complete)) warnings.push('Incomplete seasons are excluded from full-season averages. ERA5 updates have a five-day delay.');
  return {
    resortId: resort.id, elevation, elevationM: meters, sourceKind: 'estimate',
    sourceName: 'Open-Meteo · ERA5 reanalysis', sourceUrl: HISTORY_DOCUMENTATION,
    retrievedAt, windowLabel: 'November–April · completed winter seasons · JST', seasons, warnings,
  };
}

// Curated facts from the resort's own dated summaries, verified 15 October 2026.
// Exact daily periods are not published. Early reports remain explicitly partial.
const NISEKO_2023 = 'https://www.niseko.ne.jp/ja/news/how-much-did-it-snow-in-niseko-winter-2022-23/';
const NISEKO_REPORTS: Record<string, {
  totalCm: number; complete: boolean; sourceUrl: string; reportedAt: string; location: string; notes: string[];
}> = {
  '2020/21': { totalCm: 1589, complete: true, sourceUrl: NISEKO_2023, reportedAt: '2023-05-23', location: 'Grand Hirafu mid-mountain patrol station', notes: ['Retrospective total published in the 2022/23 season review.'] },
  '2021/22': { totalCm: 1450, complete: true, sourceUrl: NISEKO_2023, reportedAt: '2023-05-23', location: 'Grand Hirafu mid-mountain patrol station', notes: ['Retrospective total published in the 2022/23 season review.'] },
  '2022/23': { totalCm: 1400, complete: true, sourceUrl: NISEKO_2023, reportedAt: '2023-05-23', location: 'Grand Hirafu mid-mountain patrol station', notes: [] },
  '2023/24': { totalCm: 1190, complete: false, sourceUrl: 'https://www.niseko.ne.jp/en/news/how-much-did-it-snow-in-niseko-in-winter-2023-24/', reportedAt: '2024-04-27', location: 'Grand Hirafu mid-mountain · 820 m', notes: ['Published before the lifts closed; this is the reported amount as of the article, not a verified final-season total.'] },
  '2024/25': { totalCm: 1283, complete: false, sourceUrl: 'https://www.niseko.ne.jp/en/news/2025-niseko-season-snowfall/', reportedAt: '2025-04-17', location: 'Niseko United · station not specified', notes: ['The report says the season was still running. Its total does not identify a measurement station.'] },
  '2025/26': { totalCm: 1350, complete: true, sourceUrl: 'https://www.niseko.ne.jp/en/news/how-much-did-it-snow-in-niseko-this-winter/', reportedAt: '2026-05-28', location: 'Niseko United · review references Grand Hirafu 850 m station', notes: ['Published resort season total of 13.5 m, converted to centimetres. The total does not restate its observation station or exact start date.'] },
};

export function hasOfficialSnowfallHistory(resort: Resort): boolean {
  return resort.id === 'niseko';
}

function officialHistory(resort: Resort, elevation: Elevation, range: HistoryRange, now: Date): SnowfallHistory {
  if (!hasOfficialSnowfallHistory(resort)) throw new Error('Verified resort history is not available for this resort. Choose model estimates.');
  const seasons = getCompletedSeasonWindows(range, now).map(({ season }): SeasonSnowfall => {
    const candidate = NISEKO_REPORTS[season];
    const report = candidate && candidate.reportedAt <= japanDate(now) ? candidate : undefined;
    return {
      season, startDate: null, endDate: null,
      totalCm: report?.totalCm ?? null, complete: report?.complete ?? false,
      availableDays: 0, expectedDays: 0, monthly: [],
      sourceUrl: report?.sourceUrl ?? null, reportedAt: report?.reportedAt ?? null,
      location: report?.location ?? null,
      notes: report?.notes ?? ['A verified official total has not been added for this season.'],
    };
  });
  return {
    resortId: resort.id, elevation, elevationM: null, sourceKind: 'resort',
    sourceName: 'Niseko United · published resort records', sourceUrl: NISEKO_2023,
    retrievedAt: '2026-10-15T00:00:00+09:00',
    windowLabel: 'Resort-reported winter seasons · exact daily periods vary or are unstated', seasons,
    warnings: [
      'Published resort records are kept separate from model estimates. No estimated values fill missing official years.',
      'Observation locations and report cut-off dates vary. Early reports are marked partial; these records do not form a uniform series for calculating an average.',
      'Official totals use their reporting stations, regardless of the base or upper forecast setting. These are cumulative snowfall amounts, not snow depth.',
    ],
  };
}

function cacheKey(resort: Resort, elevation: Elevation, range: HistoryRange, now: Date) {
  const meters = validateSelection(resort, elevation);
  const windows = getCompletedSeasonWindows(range, now);
  return `${CACHE_VERSION}:${resort.id}:${resort.latitude}:${resort.longitude}:${elevation}:${meters}:${range}:${windows.at(-1)!.season}`;
}
function pruneCache(now: number) {
  for (const [key, entry] of memoryCache) {
    if (entry.storedAt > now || now - entry.storedAt >= HISTORY_CACHE_TTL_MS) memoryCache.delete(key);
  }
  while (memoryCache.size > HISTORY_CACHE_MAX_ENTRIES) {
    const oldest = [...memoryCache.values()].sort((a, b) => a.storedAt - b.storedAt)[0];
    if (oldest) memoryCache.delete(oldest.key);
  }
}
function readCache(key: string, now: number): CacheEntry | undefined {
  pruneCache(now);
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_VERSION);
    // Bound untrusted stored JSON before parsing or hydrating the memory cache.
    const entries: unknown = raw && raw.length <= 3_000_000 ? JSON.parse(raw) : null;
    if (Array.isArray(entries)) {
      for (const value of entries.slice(-HISTORY_CACHE_MAX_ENTRIES)) {
        if (record(value) && typeof value.key === 'string' && value.key.startsWith(`${CACHE_VERSION}:`)
          && typeof value.storedAt === 'number' && Number.isFinite(value.storedAt)
          && value.storedAt <= now && now - value.storedAt < HISTORY_CACHE_TTL_MS) {
          memoryCache.set(value.key, { key: value.key, storedAt: value.storedAt, response: value.response });
        }
      }
    }
  } catch { /* History also works when browser storage is unavailable. */ }
  pruneCache(now);
  return memoryCache.get(key);
}
function writeCache(entry: CacheEntry) {
  memoryCache.set(entry.key, entry);
  pruneCache(Date.now());
  try { globalThis.localStorage?.setItem(CACHE_VERSION, JSON.stringify([...memoryCache.values()])); }
  catch { /* Persistence is optional. */ }
}
export function clearHistoryCache() {
  cacheGeneration++;
  memoryCache.clear();
  try { globalThis.localStorage?.removeItem(CACHE_VERSION); } catch { /* Persistence is optional. */ }
}

/** Called only after the history view is opened. Each source remains a separate dataset. */
export async function fetchSnowfallHistory(
  resort: Resort, elevation: Elevation, range: HistoryRange, signal?: AbortSignal,
  sourceKind: HistorySourceKind = hasOfficialSnowfallHistory(resort) ? 'resort' : 'estimate',
): Promise<SnowfallHistory> {
  checkAbort(signal);
  validateSelection(resort, elevation);
  const now = new Date();
  if (sourceKind === 'resort') return officialHistory(resort, elevation, range, now);
  if (sourceKind !== 'estimate') throw new Error('Choose resort records or model estimates.');
  const key = cacheKey(resort, elevation, range, now);
  const generation = cacheGeneration;
  const cached = readCache(key, now.getTime());
  if (cached) {
    try { return parseHistoryResponse(cached.response, resort, elevation, range, new Date(cached.storedAt).toISOString(), now); }
    catch { memoryCache.delete(key); /* Invalid browser storage is replaced by a fresh provider response. */ }
  }
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason ?? new DOMException('Request cancelled', 'AbortError'));
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('History request timed out', 'TimeoutError')), HISTORY_REQUEST_TIMEOUT_MS);
  try {
    const result = await fetch(buildHistoryUrl(resort, elevation, range, now), { signal: controller.signal });
    checkAbort(controller.signal);
    if (!result.ok) throw new Error(`The history service could not load snowfall (HTTP ${result.status}). Please try again.`);
    const response: unknown = await result.json();
    checkAbort(controller.signal);
    const storedAt = Date.now();
    const history = parseHistoryResponse(response, resort, elevation, range, new Date(storedAt).toISOString(), now);
    // A partial season from the provider's delay must not remain stale for seven days.
    if (generation === cacheGeneration && history.seasons.every((season) => season.complete)) writeCache({ key, storedAt, response });
    return history;
  } catch (error) {
    if (controller.signal.aborted) {
      if (controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError') {
        throw new Error('The history service took too long to respond. Please try again.');
      }
      checkAbort(controller.signal);
    }
    if (error instanceof TypeError) throw new Error('Snowfall history could not be reached. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
