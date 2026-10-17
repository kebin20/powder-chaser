import type { ResortReports } from '../src/lib/resort-reports';
export function collectOfficialReports(options?: {
  fetchImpl?: typeof fetch;
  now?: Date;
  onError?: (message: string) => void;
}): Promise<ResortReports>;
