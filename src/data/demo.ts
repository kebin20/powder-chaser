import type { Elevation, Resort, WeatherSnapshot } from '../types';
import { japanDate, addDays } from '../lib/dates';
import { assembleSnapshot } from '../lib/snapshot';
import { WEATHER_MODELS } from './providers';

interface Scenario {
  snow: [number, number, number];
  temperature: number;
  wind: number;
  fresh: number;
  depth: number;
}

const SCENARIOS: Record<string, Scenario> = {
  myoko: { snow: [28, 34, 31], temperature: -7, wind: 17, fresh: 12, depth: 180 },
  kagura: { snow: [14, 26, 18], temperature: -5, wind: 25, fresh: 7, depth: 155 },
  hakuba: { snow: [7, 10, 8], temperature: -4, wind: 18, fresh: 4, depth: 125 },
  nozawa: { snow: [22, 29, 25], temperature: -6, wind: 15, fresh: 11, depth: 170 },
  madarao: { snow: [17, 23, 19], temperature: -4, wind: 21, fresh: 9, depth: 145 },
  niseko: { snow: [27, 32, 30], temperature: -10, wind: 22, fresh: 18, depth: 215 },
  rusutsu: { snow: [24, 29, 26], temperature: -9, wind: 16, fresh: 15, depth: 200 },
  furano: { snow: [8, 13, 10], temperature: -12, wind: 12, fresh: 5, depth: 150 },
};

/** Winter examples follow upcoming dates for interaction, regardless of the real season. */
export function getDemoSnapshot(
  resort: Resort, date: string, elevation: Elevation, now = new Date(),
): WeatherSnapshot {
  const scenario = SCENARIOS[resort.id] ?? SCENARIOS.myoko;
  const laterMorning = date === addDays(japanDate(now), 2);
  const warmerBase = elevation === 'base';
  const snowChange = (laterMorning ? -8 : 0) + (warmerBase ? -6 : 0);
  // Kagura illustrates a rain/snow line: upper snow can coexist with lower rain.
  const baseRain = warmerBase && resort.id === 'kagura';
  const updatedAt = now.toISOString();
  const models = WEATHER_MODELS.map((provider, index) => ({
    ...provider,
    snowfallCm: Math.max(0, scenario.snow[index] + snowChange),
    tempC: baseRain ? 2 + index * 0.3 : scenario.temperature + (warmerBase ? 4 : 0) + index * 0.3,
    windKph: scenario.wind + index * 2 + (laterMorning ? 3 : 0),
    rainMm: baseRain ? 3 + index * 0.4 : 0,
    updatedAt, issuedAt: null, complete: true,
  }));
  return assembleSnapshot('demo', resort, date, elevation, models, {
    snowfall24hCm: scenario.fresh, depthCm: scenario.depth,
    location: 'Example reporting station · fictional', updatedAt,
    sourceUrl: resort.officialReportUrl, fictional: true,
  }, {
    status: 'open', verifiedForDate: date,
    details: 'Fictional open-lift scenario; no real operations report is connected.',
    updatedAt,
  }, updatedAt, [
    'All demo snowfall, snow depth, weather and lift conditions are fictional winter examples.',
    'Dates are upcoming JST mornings; these examples do not describe the current season.',
  ]);
}
