import type { ResortReport, ResortOperationsReport } from '../../src/lib/resort-reports';
export const OFFICIAL_REPORT_SOURCES: Readonly<{
  rusutsu: Readonly<{ sourceName: string; sourceUrl: string; operationsUrl: string; liftDataUrl: string; webcamUrl: string }>;
  madarao: Readonly<{ sourceName: string; sourceUrl: string; webcamUrl: string }>;
  hakuba: Readonly<{ sourceName: string; sourceUrl: string; webcamUrl: string }>;
  nozawa: Readonly<{ sourceName: string; sourceUrl: string; webcamUrl: string }>;
}>;
export function emptyOfficialReport(id: keyof typeof OFFICIAL_REPORT_SOURCES): ResortReport;
export function parseRusutsuSnowReport(html: string): ResortReport;
export function parseMadaraoSnowReport(html: string): ResortReport;
export function parseHappoSnowReport(html: string): ResortReport;
export function parseNozawaLiftReport(html: string): ResortOperationsReport;
export function parseRusutsuLiftReport(payload: unknown): ResortOperationsReport;
