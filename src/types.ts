export type Elevation = 'base' | 'upper';
export type DataMode = 'demo' | 'live';
export type Verdict = 'go' | 'maybe' | 'skip';

export interface Resort {
  id: string;
  name: string;
  region: 'Nagano' | 'Niigata' | 'Hokkaido';
  latitude: number;
  longitude: number;
  baseElevationM: number;
  upperElevationM: number;
  baseElevation: number;
  upperElevation: number;
  officialUrl: string;
  officialReportUrl: string;
}

export interface TripDate {
  id: string;
  date: string;
  label: string;
  shortLabel: string;
  weekday: string;
}

export interface ForecastModel {
  id: string;
  label: string;
  sourceUrl: string;
  snowfallCm: number | null;
  tempC: number | null;
  windKph: number | null;
  rainMm: number | null;
  /** Retrieval time, not the model's issue time. */
  updatedAt: string;
  issuedAt: string | null;
  complete: boolean;
}

export interface SnowReport {
  snowfall24hCm: number | null;
  depthCm: number | null;
  location: string;
  updatedAt: string | null;
  sourceUrl: string;
  fictional: boolean;
}

export interface Operations {
  status: 'open' | 'hold' | 'closed' | 'unknown';
  verifiedForDate: string | null;
  details: string;
  updatedAt: string | null;
}

export interface OvernightWindow {
  start: string;
  end: string;
  label: string;
}

export interface WeatherSnapshot {
  mode: DataMode;
  resortId: string;
  date: string;
  elevation: Elevation;
  elevationM: number;
  models: ForecastModel[];
  forecasts: ForecastModel[];
  report: SnowReport;
  operations: Operations;
  window: OvernightWindow;
  windowLabel: string;
  minCm: number | null;
  maxCm: number | null;
  typicalCm: number | null;
  tempC: number | null;
  windKph: number | null;
  rainMm: number | null;
  reportedFreshCm: number | null;
  snowDepthCm: number | null;
  updatedAt: string;
  updatedLabel: string;
  reportUpdatedLabel: string;
  warnings: string[];
}

export interface PowderDecision {
  status: Verdict;
  title: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  confidenceLabel: string;
  quality: 'dry' | 'mixed' | 'rain' | 'unknown';
  qualityLabel: string;
  minCm: number | null;
  maxCm: number | null;
  typicalCm: number | null;
}
