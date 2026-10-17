import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { collectOfficialReports } from '../scripts/collect-resort-reports.mjs';
import {
  OFFICIAL_REPORT_SOURCES, parseMadaraoSnowReport, parseRusutsuLiftReport, parseRusutsuSnowReport,
} from '../scripts/lib/official-report-parsers.mjs';
import { parseResortReports } from '../src/lib/resort-reports';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/official-reports/${name}`, import.meta.url), 'utf8');
const rusutsu = fixture('rusutsu-snow.html');
const madarao = fixture('madarao-snow.html');
const lifts = JSON.parse(fixture('rusutsu-lifts.json'));
const NOW = new Date('2026-10-18T03:00:00Z');

function reportResponse(url: string) {
  if (url === OFFICIAL_REPORT_SOURCES.rusutsu.sourceUrl) return new Response(rusutsu);
  if (url === OFFICIAL_REPORT_SOURCES.rusutsu.liftDataUrl) return Response.json(lifts);
  if (url === OFFICIAL_REPORT_SOURCES.madarao.sourceUrl) return new Response(madarao);
  throw new Error('Unexpected source');
}
function fetcher(fn: (url: string) => Response | Promise<Response>) {
  return vi.fn(async (input: string | URL | Request) => fn(String(input))) as unknown as typeof fetch;
}

describe('official snow report adapters', () => {
  it('preserves the official Rusutsu station/time and missing off-season fields', () => {
    expect(parseRusutsuSnowReport(rusutsu)).toMatchObject({
      sourceName: 'Rusutsu Resort', station: 'West Mt.',
      reportedAt: '2026-10-16T23:21:00.000Z', reportDate: '2026-10-17',
      snowfall24hCm: null, depthCm: null, operations: null,
      webcamUrl: 'https://rusutsu.com/en/live-mountain-cams/',
    });
  });
  it('reads reported centimetres, retaining explicit zero and fractional snowfall', () => {
    const winter = rusutsu.replace('<dd>--cm</dd>', '<dd>180cm</dd>').replace('<dd>--cm</dd>', '<dd>0.4cm</dd>');
    expect(parseRusutsuSnowReport(winter)).toMatchObject({ depthCm: 180, snowfall24hCm: 0.4 });
    expect(parseRusutsuSnowReport(winter.replace('0.4cm', '0cm')).snowfall24hCm).toBe(0);
  });
  it('does not turn placeholders or unexpected units into a measured zero', () => {
    for (const invalid of ['', '-', 'N/A', '-2cm', '20mm', 'NaN', '10001cm', '4 to 8cm']) {
      expect(parseRusutsuSnowReport(rusutsu.replaceAll('--cm', invalid)).snowfall24hCm).toBeNull();
    }
  });
  it('never borrows a news/page date or accepts impossible calendar times', () => {
    expect(() => parseRusutsuSnowReport(rusutsu.replace('Update Date :', 'News Date :'))).toThrow(/timestamp/);
    expect(() => parseRusutsuSnowReport(rusutsu.replace('17/10/2026', '31/02/2026'))).toThrow(/timestamp/);
    expect(() => parseRusutsuSnowReport(rusutsu.replace('8:21', '25:21'))).toThrow(/timestamp/);
    expect(() => parseRusutsuSnowReport('<p>Update Date : 17/10/2026(Sat.) 8:21</p>')).toThrow(/board/);
  });
  it('rejects an unrecognized station rather than attributing its snow to West Mt.', () => {
    expect(() => parseRusutsuSnowReport(rusutsu.replace('West Mt.', 'Mt. Isola'))).toThrow(/station/);
  });
  it('uses the explicit Madarao 24-hour label and leaves planned lift operation unknown', () => {
    expect(parseMadaraoSnowReport(madarao)).toMatchObject({
      reportedAt: '2026-08-17T00:53:00.000Z', reportDate: '2026-08-17',
      snowfall24hCm: null, depthCm: null, station: null, operations: null,
    });
    const winter = madarao.replace('<strong>-</strong>', '<strong>245</strong>').replace('<strong>-</strong>', '<strong>12</strong>');
    expect(parseMadaraoSnowReport(winter)).toMatchObject({ depthCm: 245, snowfall24hCm: 12 });
    expect(parseMadaraoSnowReport(winter.replace('降雪（24H）', '降雪')).snowfall24hCm).toBeNull();
  });
  it('handles midnight/noon AM/PM without inventing a date or accepting invalid hours', () => {
    expect(parseMadaraoSnowReport(madarao.replace('9:53 am', '12:00 am')).reportedAt).toBe('2026-08-16T15:00:00.000Z');
    expect(parseMadaraoSnowReport(madarao.replace('9:53 am', '12:00 pm')).reportedAt).toBe('2026-08-17T03:00:00.000Z');
    expect(() => parseMadaraoSnowReport(madarao.replace('9:53 am', '13:53 pm'))).toThrow(/timestamp/);
    expect(() => parseMadaraoSnowReport(madarao.replace('2026-08-17', '2026-02-30'))).toThrow(/timestamp/);
  });
});

describe('independently dated official lift states', () => {
  it('retains the actual stale Rusutsu lift update instead of using the snow update', () => {
    expect(parseRusutsuLiftReport(lifts)).toMatchObject({
      status: 'closed', reportedAt: '2026-04-01T23:04:22.000Z', reportDate: '2026-04-02',
      details: 'All 18 lifts reported closed.', sourceUrl: OFFICIAL_REPORT_SOURCES.rusutsu.operationsUrl,
    });
  });
  it.each([
    [['運転中', '減速運転'], 'open'],
    [['運転中', '運休/本日営業終了'], 'partial'],
    [['運行待ち', '待機調査中'], 'hold'],
    [['運行待ち', '運休/本日営業終了'], 'hold'],
    [['運休/本日営業終了'], 'closed'],
    [['運転中', 'unknown future code'], 'unknown'],
  ])('normalizes explicit lift states %j to %s', (states, expected) => {
    expect(parseRusutsuLiftReport({ other: lifts.other, lift: states.map((stat) => ({ stat })) }).status).toBe(expected);
  });
  it('requires a source timestamp and a nonempty bounded lift list', () => {
    expect(() => parseRusutsuLiftReport({ ...lifts, other: {} })).toThrow(/timestamp/);
    expect(() => parseRusutsuLiftReport({ ...lifts, lift: [] })).toThrow(/list/);
    expect(() => parseRusutsuLiftReport({ ...lifts, lift: Array(101).fill({ stat: '運転中' }) })).toThrow(/list/);
  });
});

describe('bounded scheduled report collection', () => {
  it('creates a client-compatible payload with separate collection and source report dates', async () => {
    const request = fetcher(reportResponse);
    const payload = await collectOfficialReports({ fetchImpl: request, now: NOW });
    expect(payload.generatedAt).toBe(NOW.toISOString());
    expect(payload.reports.rusutsu.reportDate).toBe('2026-10-17');
    expect(payload.reports.rusutsu.operations?.reportDate).toBe('2026-04-02');
    expect(payload.reports.madarao.reportDate).toBe('2026-08-17');
    expect(parseResortReports(payload)).toEqual(payload);
    expect(request).toHaveBeenCalledTimes(3);
    for (const [, options] of vi.mocked(request).mock.calls) expect(options).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
  });
  it('preserves successful lift collection when the snow report request fails', async () => {
    const errors: string[] = [];
    const payload = await collectOfficialReports({ now: NOW, onError: (message) => errors.push(message),
      fetchImpl: fetcher((url) => url === OFFICIAL_REPORT_SOURCES.rusutsu.sourceUrl ? new Response('Forbidden', { status: 403 }) : reportResponse(url)),
    });
    expect(payload.reports.rusutsu.reportedAt).toBeNull();
    expect(payload.reports.rusutsu.depthCm).toBeNull();
    expect(payload.reports.rusutsu.operations?.status).toBe('closed');
    expect(payload.reports.madarao.reportedAt).not.toBeNull();
    expect(errors).toEqual(['Rusutsu snow: Official source returned HTTP 403']);
  });
  it('preserves snow when lifts are unavailable and does not infer operations from a weather report', async () => {
    const payload = await collectOfficialReports({ now: NOW,
      fetchImpl: fetcher((url) => url === OFFICIAL_REPORT_SOURCES.rusutsu.liftDataUrl ? Response.json({}) : reportResponse(url)),
    });
    expect(payload.reports.rusutsu.reportedAt).not.toBeNull();
    expect(payload.reports.rusutsu.operations).toBeNull();
  });
  it('bounds retry to two attempts and does not retry HTTP 403/404', async () => {
    const calls = new Map<string, number>();
    const request = fetcher((url) => {
      calls.set(url, (calls.get(url) ?? 0) + 1);
      return new Response('Unavailable', { status: url === OFFICIAL_REPORT_SOURCES.rusutsu.sourceUrl ? 503 : 403 });
    });
    const payload = await collectOfficialReports({ now: NOW, fetchImpl: request });
    expect(calls.get(OFFICIAL_REPORT_SOURCES.rusutsu.sourceUrl)).toBe(2);
    expect(calls.get(OFFICIAL_REPORT_SOURCES.rusutsu.liftDataUrl)).toBe(1);
    expect(calls.get(OFFICIAL_REPORT_SOURCES.madarao.sourceUrl)).toBe(1);
    expect(Object.values(payload.reports).every((report) => report.reportedAt === null)).toBe(true);
  });
  it('recovers from a transient network failure without substituting stale prior output', async () => {
    const attempts = new Map<string, number>();
    const payload = await collectOfficialReports({ now: NOW, fetchImpl: fetcher((url) => {
      attempts.set(url, (attempts.get(url) ?? 0) + 1);
      if (attempts.get(url) === 1) throw new Error('Transient failure');
      return reportResponse(url);
    }) });
    expect(payload.reports.rusutsu.reportedAt).not.toBeNull();
    expect(payload.reports.madarao.reportedAt).not.toBeNull();
    expect([...attempts.values()]).toEqual([2, 2, 2]);
  });
  it('rejects oversized/unrecognized source bodies without publishing page text', async () => {
    const errors: string[] = [];
    const payload = await collectOfficialReports({ now: NOW, onError: (message) => errors.push(message),
      fetchImpl: fetcher((url) => url === OFFICIAL_REPORT_SOURCES.madarao.sourceUrl ? new Response('x'.repeat(1_000_001)) : reportResponse(url)),
    });
    expect(payload.reports.madarao.reportedAt).toBeNull();
    expect(errors).toEqual(['Madarao snow: Official source exceeded the size limit']);
  });
  it('rejects invalid collection dates', async () => {
    await expect(collectOfficialReports({ now: new Date(NaN), fetchImpl: fetcher(reportResponse) })).rejects.toThrow(/Collection time/);
  });
});
