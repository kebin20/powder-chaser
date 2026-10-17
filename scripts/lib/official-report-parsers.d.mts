import type { ResortReport, ResortOperationsReport } from '../../src/lib/resort-reports';
export const OFFICIAL_REPORT_SOURCES: Readonly<{
  rusutsu: Readonly<{ sourceName: string; sourceUrl: string; operationsUrl: string; liftDataUrl: string; webcamUrl: string }>;
  madarao: Readonly<{ sourceName: string; sourceUrl: string; webcamUrl: string }>;
}>;
export function emptyOfficialReport(id: 'rusutsu' | 'madarao'): ResortReport;
export function parseRusutsuSnowReport(html: string): ResortReport;
export function parseMadaraoSnowReport(html: string): ResortReport;
export function parseRusutsuLiftReport(payload: unknown): ResortOperationsReport;
