#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  OFFICIAL_REPORT_SOURCES, emptyOfficialReport,
  parseMadaraoSnowReport, parseRusutsuSnowReport, parseRusutsuLiftReport,
  parseHappoSnowReport, parseNozawaLiftReport,
} from './lib/official-report-parsers.mjs';

const ALLOWED_URLS = new Set([
  OFFICIAL_REPORT_SOURCES.rusutsu.sourceUrl, OFFICIAL_REPORT_SOURCES.rusutsu.liftDataUrl,
  OFFICIAL_REPORT_SOURCES.madarao.sourceUrl,
  OFFICIAL_REPORT_SOURCES.hakuba.sourceUrl, OFFICIAL_REPORT_SOURCES.nozawa.sourceUrl,
]);
const MAX_BYTES = 1_000_000;

async function download(url, fetchImpl) {
  if (!ALLOWED_URLS.has(url)) throw new Error('Official report URL is not allowlisted');
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: 'error', signal: AbortSignal.timeout(8_000),
        headers: { 'User-Agent': 'PowderChaser/1.0 (+https://github.com/kebin20/powder-chaser)', Accept: 'text/html, application/json' },
      });
    } catch {
      if (attempt === 0) continue;
      throw new Error('Network request failed or timed out');
    }
    if (!response.ok) {
      if (attempt === 0 && response.status >= 500) continue;
      throw new Error(`Official source returned HTTP ${response.status}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Official source returned an empty body');
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_BYTES) throw new Error('Official source exceeded the size limit');
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('Official source is unavailable');
}

export async function collectOfficialReports({ fetchImpl = fetch, now = new Date(), onError = () => {} } = {}) {
  if (!Number.isFinite(now.getTime())) throw new Error('Collection time must be a valid date');
  const reports = Object.fromEntries(Object.keys(OFFICIAL_REPORT_SOURCES).map((id) => [id, emptyOfficialReport(id)]));
  const collect = async (label, url, parser, apply) => {
    try { apply(parser(await download(url, fetchImpl))); }
    catch (error) { onError(`${label}: ${error instanceof Error ? error.message : 'Report unavailable'}`); }
  };
  const jobs = [
    () => collect('Rusutsu snow', OFFICIAL_REPORT_SOURCES.rusutsu.sourceUrl, parseRusutsuSnowReport,
      (report) => { reports.rusutsu = { ...report, operations: reports.rusutsu.operations }; }),
    () => collect('Rusutsu lifts', OFFICIAL_REPORT_SOURCES.rusutsu.liftDataUrl, (body) => parseRusutsuLiftReport(JSON.parse(body)),
      (operations) => { reports.rusutsu.operations = operations; }),
    () => collect('Madarao snow', OFFICIAL_REPORT_SOURCES.madarao.sourceUrl, parseMadaraoSnowReport,
      (report) => { reports.madarao = report; }),
    () => collect('Happo snow', OFFICIAL_REPORT_SOURCES.hakuba.sourceUrl, parseHappoSnowReport,
      (report) => { reports.hakuba = report; }),
    () => collect('Nozawa lifts', OFFICIAL_REPORT_SOURCES.nozawa.sourceUrl, parseNozawaLiftReport,
      (operations) => { reports.nozawa.operations = operations; }),
  ];
  // Keep source traffic bounded as coverage expands; each endpoint still fails independently.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => {
    while (next < jobs.length) await jobs[next++]();
  }));
  return { version: 1, generatedAt: now.toISOString(), reports };
}

async function main() {
  const args = process.argv.slice(2);
  let output = resolve('public/data/resort-reports.json');
  let now = new Date();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`A value is required for ${flag}`);
    if (flag === '--output') output = resolve(value);
    else if (flag === '--now') now = new Date(value);
    else throw new Error(`Unknown option: ${flag}`);
  }
  const payload = await collectOfficialReports({ now, onError: (message) => process.stderr.write(`${message}\n`) });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(payload)}\n`);
  const reportCount = Object.values(payload.reports).filter((report) => report.reportedAt !== null).length;
  const operationCount = Object.values(payload.reports).filter((report) => report.operations !== null).length;
  process.stderr.write(`Collected ${reportCount}/3 dated snow/depth reports and ${operationCount}/2 dated lift reports.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
