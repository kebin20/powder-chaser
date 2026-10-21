import type { Elevation, ForecastModel, Operations, Resort, WeatherSnapshot } from '../types';
import { japanDate, addDays } from '../lib/dates';
import { assembleSnapshot } from '../lib/snapshot';
import { WEATHER_MODELS } from './providers';

export const DEMO_SCENARIOS = [
  { id: 'resort-default', label: 'Resort examples', description: 'The original eight fictional winter examples, with different snowfall at each resort.' },
  { id: 'powder', label: 'Cold powder day', description: 'Three strong snowfall forecasts, cold temperatures and fictional open lifts.' },
  { id: 'light-snow', label: 'Light snowfall', description: 'Cold weather and fictional open lifts, but all three forecasts fall below the default 20 cm threshold.' },
  { id: 'unconfirmed', label: 'Powder, access unconfirmed', description: 'Strong, cold snowfall forecasts with no fictional lift confirmation yet.' },
  { id: 'disagreement', label: 'Conflicting forecasts', description: 'The models disagree on whether enough fresh snow will fall.' },
  { id: 'rain', label: 'Snow above, rain below', description: 'Cold upper-mountain snow with warmer, rainy conditions at the base. Compare both elevations.' },
  { id: 'wind', label: 'Strong wind and lift hold', description: 'Good snowfall with strong wind and a fictional lift hold.' },
  { id: 'closed', label: 'Terrain closed', description: 'Good snowfall with fictional closed terrain for the selected date.' },
  { id: 'stale', label: 'Outdated reports', description: 'Forecasts and resort observations were retrieved 26 hours ago.' },
  { id: 'missing', label: 'Missing forecast data', description: 'Incomplete model forecasts and no available resort observation or lift confirmation.' },
  { id: 'connection-error', label: 'Connection failure', description: 'A simulated loading error. Live weather requests are not made.' },
] as const;

export type DemoScenarioId = typeof DEMO_SCENARIOS[number]['id'];

export function normalizeDemoScenario(value: unknown): DemoScenarioId {
  return DEMO_SCENARIOS.find(scenario => scenario.id === value)?.id ?? 'resort-default';
}

export function getDemoError(scenarioId: DemoScenarioId): string | null {
  return scenarioId === 'connection-error'
    ? 'Simulated connection failure. Choose another Winter Demo scenario or load live forecasts to continue.'
    : null;
}

interface Scenario {
  snow: [number, number, number];
  temperature: number;
  wind: number;
  fresh: number;
  depth: number;
}

const RESORT_SCENARIOS: Record<string, Scenario> = {
  myoko: { snow: [28, 34, 31], temperature: -7, wind: 17, fresh: 12, depth: 180 },
  kagura: { snow: [14, 26, 18], temperature: -5, wind: 25, fresh: 7, depth: 155 },
  hakuba: { snow: [7, 10, 8], temperature: -4, wind: 18, fresh: 4, depth: 125 },
  nozawa: { snow: [22, 29, 25], temperature: -6, wind: 15, fresh: 11, depth: 170 },
  madarao: { snow: [17, 23, 19], temperature: -4, wind: 21, fresh: 9, depth: 145 },
  niseko: { snow: [27, 32, 30], temperature: -10, wind: 22, fresh: 18, depth: 215 },
  rusutsu: { snow: [24, 29, 26], temperature: -9, wind: 16, fresh: 15, depth: 200 },
  furano: { snow: [8, 13, 10], temperature: -12, wind: 12, fresh: 5, depth: 150 },
};

const POWDER_SCENARIO: Scenario = { snow: [32, 38, 35], temperature: -9, wind: 14, fresh: 24, depth: 210 };

export function hasDemoScenario(resort: Resort, scenarioId: DemoScenarioId = 'resort-default'): boolean {
  return scenarioId !== 'resort-default' || Object.hasOwn(RESORT_SCENARIOS, resort.id);
}

/** Fictional scenarios follow upcoming dates, including at catalogue resorts without a curated example. */
export function getDemoSnapshot(
  resort: Resort, date: string, elevation: Elevation, now = new Date(),
  scenarioId: DemoScenarioId = 'resort-default',
): WeatherSnapshot {
  const error = getDemoError(scenarioId);
  if (error) throw new Error(error);
  const resortDefault = scenarioId === 'resort-default';
  const scenario = resortDefault ? RESORT_SCENARIOS[resort.id]
    : scenarioId === 'light-snow' ? { ...POWDER_SCENARIO, snow: [5, 9, 7] as [number, number, number], fresh: 2 }
    : scenarioId === 'disagreement' ? { ...POWDER_SCENARIO, snow: [8, 36, 18] as [number, number, number] }
    : scenarioId === 'wind' ? { ...POWDER_SCENARIO, wind: 58 }
    : POWDER_SCENARIO;
  if (!scenario) throw new Error('This resort has no winter demo. Choose a test scenario or use live model forecasts.');
  const laterMorning = date === addDays(japanDate(now), 2);
  const warmerBase = elevation === 'base';
  const snowChange = resortDefault
    ? (laterMorning ? -8 : 0) + (warmerBase ? -6 : 0)
    : (laterMorning ? -4 : 0) + (warmerBase ? -4 : 0);
  // Kagura's original example and the explicit rain scenario show a changing snow line.
  const baseRain = warmerBase && (scenarioId === 'rain' || (resortDefault && resort.id === 'kagura'));
  const updatedAt = new Date(now.getTime() - (scenarioId === 'stale' ? 26 * 3_600_000 : 0)).toISOString();
  const models: ForecastModel[] = WEATHER_MODELS.map((provider, index) => ({
    ...provider,
    label: `${provider.label} · simulated`,
    snowfallCm: Math.max(0, scenario.snow[index] + snowChange),
    tempC: baseRain ? 2 + index * 0.3 : scenario.temperature + (warmerBase ? 4 : 0) + index * 0.3,
    windKph: scenario.wind + index * 2 + (laterMorning ? 3 : 0),
    rainMm: baseRain ? 3 + index * 0.4 : 0,
    updatedAt, issuedAt: null, complete: true,
  }));
  if (scenarioId === 'missing') {
    // One complete model remains; the others are genuinely unknown, never fabricated zero snow.
    Object.assign(models[1], { snowfallCm: null, tempC: null, windKph: null, rainMm: null, complete: false });
    Object.assign(models[2], { snowfallCm: null, tempC: null, windKph: null, rainMm: null, complete: false });
  }
  const status: Operations['status'] = scenarioId === 'wind' ? 'hold' : scenarioId === 'closed' ? 'closed' : scenarioId === 'missing' || scenarioId === 'unconfirmed' ? 'unknown' : 'open';
  const operationDetails = status === 'hold' ? 'Fictional lift hold due to strong wind; this is not a current operations report.'
    : status === 'closed' ? 'Fictional closed-terrain scenario; this is not a current operations report.'
    : status === 'unknown' ? 'Fictional missing lift report; access has not been confirmed.'
    : 'Fictional open-lift scenario; this is not a current operations report.';
  const snapshot = assembleSnapshot('demo', resort, date, elevation, models, {
    snowfall24hCm: scenarioId === 'missing' ? null : scenario.fresh,
    depthCm: scenarioId === 'missing' ? null : scenario.depth,
    location: 'Example reporting station · fictional',
    updatedAt: scenarioId === 'missing' ? null : updatedAt,
    sourceUrl: resort.officialReportUrl, fictional: true,
  }, {
    status, verifiedForDate: status === 'unknown' ? null : date,
    details: operationDetails, updatedAt: status === 'unknown' ? null : updatedAt,
  }, updatedAt, [
    'All demo snowfall, snow depth, weather and lift conditions are fictional winter examples.',
    'Dates are upcoming JST mornings; these examples do not describe the current season.',
    ...(!resortDefault ? [`Simulated test: ${DEMO_SCENARIOS.find(value => value.id === scenarioId)!.label}. These conditions are not specific to ${resort.name}.`] : []),
    ...(scenarioId === 'stale' ? ['Simulated outdated data: forecasts and observations are 26 hours old.'] : []),
    ...(scenarioId === 'missing' ? ['Simulated missing data: two forecast models, snow observations and lift confirmation are unavailable.'] : []),
  ]);
  if (scenarioId === 'stale') {
    snapshot.updatedLabel = 'Simulated forecast · 26 hours old';
    snapshot.reportUpdatedLabel = 'Fictional report · 26 hours old';
  }
  return snapshot;
}
