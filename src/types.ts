export type Elevation = 'base' | 'upper';
export type DataMode = 'demo' | 'live';
export type Verdict = 'go' | 'maybe' | 'skip';

export interface Resort {
  id: string;
  name: string;
  /** Prefecture, derived from the catalogue's place metadata. */
  region: string;
  regionJapanese: string;
  aliases: string[];
  locality: string | null;
  latitude: number;
  longitude: number;
  baseElevationM: number | null;
  upperElevationM: number | null;
  baseElevation: number | null;
  upperElevation: number | null;
  elevationSource: 'curated' | 'mapped' | 'unknown';
  officialUrl: string | null;
  officialReportUrl: string | null;
  catalogueStatus: 'operating' | 'unknown';
  catalogueSource: 'curated' | 'openskidata';
  /** Durable upstream identifiers; OpenSkiData content hashes change each build. */
  sourceIds: string[];
  sourceUrl: string;
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
  sourceUrl: string | null;
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
  elevationM: number | null;
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
  /** Weather potential is separate from whether lifts and terrain are accessible. */
  outlook: {
    status: 'promising' | 'borderline' | 'low' | 'unknown';
    label: string;
    reason: string;
  };
  access: {
    status: 'open' | 'hold' | 'closed' | 'unconfirmed';
    label: string;
    reason: string;
  };
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  confidenceLabel: string;
  quality: 'dry' | 'mixed' | 'rain' | 'unknown';
  qualityLabel: string;
  minCm: number | null;
  maxCm: number | null;
  typicalCm: number | null;
}
