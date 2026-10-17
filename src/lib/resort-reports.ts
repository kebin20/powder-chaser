import { japanDate } from './dates';

export const RESORT_REPORT_CACHE_TTL_MS = 15 * 60 * 1000;
export const RESORT_REPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

export type ReportFreshness = 'fresh' | 'stale' | 'unavailable';
export type ReportOperationsStatus = 'open' | 'partial' | 'hold' | 'closed' | 'unknown';

export interface ResortOperationsReport {
  status: ReportOperationsStatus;
  reportedAt: string | null;
  reportDate: string | null;
  details: string | null;
  sourceUrl: string;
}

export interface ResortReport {
  sourceName: string;
  sourceUrl: string;
  reportedAt: string | null;
  reportDate: string | null;
  station: string | null;
  snowfall24hCm: number | null;
  depthCm: number | null;
  operations: ResortOperationsReport | null;
  webcamUrl: string | null;
}

export interface ResortReports {
  version: 1;
  generatedAt: string;
  reports: Record<string, ResortReport>;
}

export interface ResortReportView {
  report: ResortReport | null;
  generatedAt: string | null;
  snowfall24h: { valueCm: number | null; status: ReportFreshness };
  depth: { valueCm: number | null; status: ReportFreshness };
  operations: {
    status: ReportOperationsStatus;
    freshness: ReportFreshness;
    appliesToTripDate: boolean;
    reportedAt: string | null;
    reportDate: string | null;
    details: string | null;
    sourceUrl: string | null;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1000 ? value.trim() : null;
}

/** Keep only absolute HTTPS links; source data never becomes executable markup. */
function sourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function reportDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !reportDate(value.slice(0, 10)) || Number(value.slice(11, 13)) > 23
    || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function centimeters(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function operations(value: unknown): ResortOperationsReport | null {
  if (!isRecord(value)) return null;
  const url = sourceUrl(value.sourceUrl);
  if (!url) return null;
  const status = typeof value.status === 'string' && ['open', 'partial', 'hold', 'closed', 'unknown'].includes(value.status)
    ? value.status as ReportOperationsStatus : 'unknown';
  return {
    status, sourceUrl: url, reportedAt: timestamp(value.reportedAt), reportDate: reportDate(value.reportDate),
    details: text(value.details),
  };
}

/** Invalid optional fields become unknown independently; an invalid envelope is never cached. */
export function parseResortReports(value: unknown): ResortReports {
  if (!isRecord(value) || value.version !== 1 || !timestamp(value.generatedAt) || !isRecord(value.reports)
    || Object.keys(value.reports).length > 2000) {
    throw new Error('The resort report service returned an unreadable update. Please try again.');
  }
  const reports: Record<string, ResortReport> = Object.create(null) as Record<string, ResortReport>;
  for (const [id, report] of Object.entries(value.reports)) {
    if (!/^[a-z0-9][a-z0-9-]{0,159}$/.test(id) || !isRecord(report)) continue;
    const name = text(report.sourceName);
    const url = sourceUrl(report.sourceUrl);
    if (!name || !url) continue;
    reports[id] = {
      sourceName: name, sourceUrl: url, reportedAt: timestamp(report.reportedAt), reportDate: reportDate(report.reportDate),
      station: text(report.station), snowfall24hCm: centimeters(report.snowfall24hCm), depthCm: centimeters(report.depthCm),
      operations: operations(report.operations), webcamUrl: sourceUrl(report.webcamUrl),
    };
  }
  return { version: 1, generatedAt: timestamp(value.generatedAt)!, reports };
}

function freshness(reportedAt: string | null, day: string | null, now: Date): ReportFreshness {
  const time = reportedAt === null ? NaN : Date.parse(reportedAt);
  const age = now.getTime() - time;
  if (!Number.isFinite(age) || age < 0 || day === null || day > japanDate(now)) return 'unavailable';
  return age >= RESORT_REPORT_MAX_AGE_MS || day < japanDate(now) ? 'stale' : 'fresh';
}

/** A morning observation is separate from a forecast; today's open lifts never verify tomorrow. */
export function getResortReportView(
  payload: ResortReports | null, resortId: string, tripDate: string, now = new Date(),
): ResortReportView {
  const report = payload?.reports[resortId] ?? null;
  const snowFreshness = freshness(report?.reportedAt ?? null, report?.reportDate ?? null, now);
  const metric = (value: number | null | undefined) => ({
    valueCm: value === undefined || value === null || snowFreshness === 'unavailable' ? null : value,
    status: value === undefined || value === null ? 'unavailable' as const : snowFreshness,
  });
  const operation = report?.operations ?? null;
  const operationsFreshness = freshness(operation?.reportedAt ?? null, operation?.reportDate ?? null, now);
  const status = operationsFreshness === 'unavailable' ? 'unknown' : operation?.status ?? 'unknown';
  return {
    report, generatedAt: payload?.generatedAt ?? null,
    snowfall24h: metric(report?.snowfall24hCm), depth: metric(report?.depthCm),
    operations: {
      status, freshness: operationsFreshness,
      appliesToTripDate: operationsFreshness === 'fresh' && status !== 'unknown'
        && operation?.reportDate === tripDate && tripDate === japanDate(now),
      reportedAt: operation?.reportedAt ?? null, reportDate: operation?.reportDate ?? null,
      details: operation?.details ?? null, sourceUrl: operation?.sourceUrl ?? null,
    },
  };
}

interface CacheEntry { storedAt: number; payload: ResortReports }
interface PendingRequest {
  controller: AbortController;
  consumers: Set<symbol>;
  settled: boolean;
  promise: Promise<ResortReports>;
}
let cache: CacheEntry | null = null;
let pending: PendingRequest | null = null;
let generation = 0;

export function clearResortReportCache() {
  generation++;
  cache = null;
  pending = null;
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Request cancelled', 'AbortError');
}

async function fetchPayload(controller: AbortController, requestGeneration: number): Promise<ResortReports> {
  const timer = setTimeout(() => controller.abort(new DOMException('Resort report request timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  try {
    // Explicit no-cache lets the browser revalidate the periodically generated file.
    const response = await fetch(`${import.meta.env.BASE_URL}data/resort-reports.json`, { signal: controller.signal, cache: 'no-cache' });
    checkAbort(controller.signal);
    if (!response.ok) throw new Error(`Resort reports are unavailable (HTTP ${response.status}). Check the official resort website.`);
    const payload = parseResortReports(await response.json());
    checkAbort(controller.signal);
    if (requestGeneration === generation) cache = { storedAt: Date.now(), payload };
    return payload;
  } catch (error) {
    if (controller.signal.aborted) {
      if (controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError') {
        throw new Error('Resort reports took too long to respond. Check the official resort website.');
      }
      checkAbort(controller.signal);
    }
    if (error instanceof TypeError) throw new Error('Resort reports could not be reached. Check your connection or the official resort website.');
    throw error;
  } finally { clearTimeout(timer); }
}

function consumeRequest(request: PendingRequest, signal?: AbortSignal): Promise<ResortReports> {
  return new Promise((resolve, reject) => {
    const consumer = Symbol('resort report consumer');
    let attached = true;
    request.consumers.add(consumer);
    const detach = () => {
      if (!attached) return;
      attached = false;
      signal?.removeEventListener('abort', cancel);
      request.consumers.delete(consumer);
      if (!request.settled && request.consumers.size === 0) {
        if (pending === request) pending = null;
        request.controller.abort();
      }
    };
    const cancel = () => { detach(); reject(signal?.reason ?? new DOMException('Request cancelled', 'AbortError')); };
    signal?.addEventListener('abort', cancel, { once: true });
    request.promise.then((payload) => { if (attached) { detach(); resolve(payload); } }, (error: unknown) => {
      if (attached) { detach(); reject(error); }
    });
    if (signal?.aborted) cancel();
  });
}

/** One bounded in-memory file cache; one cancelled component does not cancel other readers. */
export async function loadResortReports(options: { signal?: AbortSignal; force?: boolean } = {}): Promise<ResortReports> {
  checkAbort(options.signal);
  const age = cache === null ? Infinity : Date.now() - cache.storedAt;
  if (!options.force && cache && age >= 0 && age < RESORT_REPORT_CACHE_TTL_MS) return cache.payload;
  cache = null;
  if (!pending) {
    const request: PendingRequest = { controller: new AbortController(), consumers: new Set(), settled: false, promise: null! };
    request.promise = fetchPayload(request.controller, generation).finally(() => {
      request.settled = true;
      if (pending === request) pending = null;
    });
    pending = request;
  }
  return consumeRequest(pending, options.signal);
}
