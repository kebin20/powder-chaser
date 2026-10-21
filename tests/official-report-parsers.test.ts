import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { collectOfficialReports } from '../scripts/collect-resort-reports.mjs';
import {
  OFFICIAL_REPORT_SOURCES, parseMadaraoSnowReport, parseRusutsuLiftReport, parseRusutsuSnowReport,
  parseHappoSnowReport, parseNozawaLiftReport,
} from '../scripts/lib/official-report-parsers.mjs';
import { parseResortReports } from '../src/lib/resort-reports';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/official-reports/${name}`, import.meta.url), 'utf8');
const rusutsu = fixture('rusutsu-snow.html');
const madarao = fixture('madarao-snow.html');
const lifts = JSON.parse(fixture('rusutsu-lifts.json'));
const happo = fixture('happo-snow.html');
const nozawa = fixture('nozawa-lifts.html');
const NOW = new Date('2026-10-21T03:00:00Z');

function reportResponse(url: string) {
  if (url === OFFICIAL_REPORT_SOURCES.rusutsu.sourceUrl) return new Response(rusutsu);
  if (url === OFFICIAL_REPORT_SOURCES.rusutsu.liftDataUrl) return Response.json(lifts);
  if (url === OFFICIAL_REPORT_SOURCES.madarao.sourceUrl) return new Response(madarao);
  if (url === OFFICIAL_REPORT_SOURCES.hakuba.sourceUrl) return new Response(happo);
  if (url === OFFICIAL_REPORT_SOURCES.nozawa.sourceUrl) return new Response(nozawa);
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
  it('keeps Happo Kurobishi depth at its actual station/time and leaves unspecified snowfall unknown', () => {
    expect(parseHappoSnowReport(happo)).toMatchObject({
      sourceName: 'Hakuba Happo-one Snow Resort', station: 'Kurobishi · 1,680 m',
      reportedAt: '2026-10-20T22:35:00.000Z', reportDate: '2026-10-21',
      depthCm: 0, snowfall24hCm: null, operations: null,
    });
    const winter = happo.replace('SnowDepth</span><strong>0', 'SnowDepth</span><strong>198.5')
      .replace('SnowFall</span><strong>0', 'SnowFall</span><strong>35');
    expect(parseHappoSnowReport(winter)).toMatchObject({ depthCm: 198.5, snowfall24hCm: null });
    expect(parseHappoSnowReport(winter.replace('SnowDepth', 'SnowFall')).depthCm).toBeNull();
  });
  it('rejects missing/yearless/invalid Happo dates and station changes, without borrowing other boards', () => {
    expect(() => parseHappoSnowReport(happo.replace('2026.10.21', '10.21'))).toThrow(/timestamp/);
    expect(() => parseHappoSnowReport(happo.replace('2026.10.21', '2026.02.30'))).toThrow(/timestamp/);
    expect(() => parseHappoSnowReport(happo.replace('07:35', '24:35'))).toThrow(/timestamp/);
    expect(() => parseHappoSnowReport(happo.replace('1,680m', '1,400m'))).toThrow(/station/);
    expect(() => parseHappoSnowReport(happo.replace('KUROBISHI', 'USAGIDAIRA'))).toThrow(/station/);
    expect(() => parseHappoSnowReport('<p>Update at 2026.10.21 07:35</p>')).toThrow(/board/);
  });
  it.each(['', '-', '--', 'N/A', '-1', '25mm', 'NaN', '10001', '5 to 8'])('keeps malformed Happo depth %j unavailable', (invalid) => {
    expect(parseHappoSnowReport(happo.replace('SnowDepth</span><strong>0</strong>cm', `SnowDepth</span><strong>${invalid}</strong>`)).depthCm).toBeNull();
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
  it('reads only the independently dated Nozawa lift board and preserves its old update', () => {
    const unrelated = '<h5>Latest update (date/time)：21/Oct/2026 08:00</h5><table><tr><td>◯</td></tr></table>';
    expect(parseNozawaLiftReport(unrelated + nozawa)).toEqual({
      status: 'closed', reportedAt: '2026-05-06T06:54:00.000Z', reportDate: '2026-05-06',
      details: 'All 17 lifts reported closed.', sourceUrl: OFFICIAL_REPORT_SOURCES.nozawa.sourceUrl,
    });
  });
  it('uses explicit Nozawa status symbols without treating opening hours as operating', () => {
    expect(parseNozawaLiftReport(nozawa.replaceAll('シーズン終了', '8:30–16:00')).status).toBe('closed');
    expect(parseNozawaLiftReport(nozawa.replaceAll('×', '◯')).status).toBe('open');
    expect(parseNozawaLiftReport(nozawa.replace('×', '◯')).status).toBe('partial');
    expect(parseNozawaLiftReport(nozawa.replace('×', '△')).status).toBe('hold');
    expect(parseNozawaLiftReport(nozawa.replace('×', 'new code')).status).toBe('unknown');
    expect(parseNozawaLiftReport(nozawa.replace('×', '')).status).toBe('unknown');
    const retired = '<!-- <table class="tb_lift"><tr><td>21</td><td>Retired</td><td>8:00</td><td>◯</td></tr></table> -->';
    expect(parseNozawaLiftReport(nozawa.replace('</h5>', `</h5>${retired}`)).details).toBe('All 17 lifts reported closed.');
  });
  it('rejects Nozawa missing years, impossible dates, malformed or duplicate lift rows', () => {
    expect(() => parseNozawaLiftReport(nozawa.replace('/2026', ''))).toThrow(/timestamp/);
    expect(() => parseNozawaLiftReport(nozawa.replace('06/May', '31/Feb'))).toThrow(/timestamp/);
    expect(() => parseNozawaLiftReport(nozawa.replace('15:54', '25:54'))).toThrow(/timestamp/);
    expect(() => parseNozawaLiftReport(nozawa.replace('now_lift', 'now_course'))).toThrow(/board/);
    expect(() => parseNozawaLiftReport(nozawa.replace('<td>2</td>', '<td>1</td>'))).toThrow(/row/);
    expect(() => parseNozawaLiftReport(nozawa.replace('<td>Nagasaka Gondola</td>', ''))).toThrow(/row/);
    expect(() => parseNozawaLiftReport(nozawa.replace(/<table[\s\S]*<\/table>/, ''))).toThrow(/list/);
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
    expect(payload.reports.hakuba.reportDate).toBe('2026-10-21');
    expect(payload.reports.hakuba.snowfall24hCm).toBeNull();
    expect(payload.reports.nozawa.reportDate).toBeNull();
    expect(payload.reports.nozawa.operations?.reportDate).toBe('2026-05-06');
    expect(parseResortReports(payload)).toEqual(payload);
    expect(request).toHaveBeenCalledTimes(5);
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
    expect(calls.get(OFFICIAL_REPORT_SOURCES.hakuba.sourceUrl)).toBe(1);
    expect(calls.get(OFFICIAL_REPORT_SOURCES.nozawa.sourceUrl)).toBe(1);
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
    expect([...attempts.values()]).toEqual([2, 2, 2, 2, 2]);
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
  it('runs at most three requests together while collecting all independent sources', async () => {
    let active = 0;
    let maximum = 0;
    const payload = await collectOfficialReports({ now: NOW, fetchImpl: fetcher(async (url) => {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return reportResponse(url);
    }) });
    expect(maximum).toBe(3);
    expect(payload.reports.hakuba.depthCm).toBe(0);
    expect(payload.reports.nozawa.operations?.status).toBe('closed');
  });
  it('keeps Nozawa snow unknown and successful sources intact if a new adapter changes', async () => {
    const errors: string[] = [];
    const payload = await collectOfficialReports({ now: NOW, onError: (message) => errors.push(message),
      fetchImpl: fetcher((url) => url === OFFICIAL_REPORT_SOURCES.hakuba.sourceUrl ? new Response(happo.replace('KUROBISHI', 'NEW STATION')) : reportResponse(url)),
    });
    expect(payload.reports.hakuba.depthCm).toBeNull();
    expect(payload.reports.hakuba.reportedAt).toBeNull();
    expect(payload.reports.nozawa.depthCm).toBeNull();
    expect(payload.reports.nozawa.snowfall24hCm).toBeNull();
    expect(payload.reports.nozawa.reportedAt).toBeNull();
    expect(payload.reports.nozawa.operations?.reportedAt).toBe('2026-05-06T06:54:00.000Z');
    expect(errors).toEqual(['Happo snow: Happo weather station is unrecognized']);
  });
});
