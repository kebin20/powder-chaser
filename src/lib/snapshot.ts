import type { DataMode, Elevation, ForecastModel, Operations, Resort, SnowReport, WeatherSnapshot } from '../types';
import { formatJapanTime, overnightWindow } from './dates';
import { summarizeModels } from './decision';

export function assembleSnapshot(
  mode: DataMode, resort: Resort, date: string, elevation: Elevation,
  models: ForecastModel[], report: SnowReport, operations: Operations,
  updatedAt: string, warnings: string[],
): WeatherSnapshot {
  const window = overnightWindow(date);
  return {
    mode, resortId: resort.id, date, elevation,
    elevationM: elevation === 'upper' ? resort.upperElevationM : resort.baseElevationM,
    models, forecasts: models, report, operations, window, windowLabel: window.label,
    ...summarizeModels(models),
    reportedFreshCm: report.snowfall24hCm, snowDepthCm: report.depthCm,
    updatedAt,
    updatedLabel: mode === 'demo' ? 'Fictional winter scenario' : `Retrieved ${formatJapanTime(updatedAt)}`,
    reportUpdatedLabel: report.fictional ? 'Illustrative report' : 'Not connected',
    warnings,
  };
}
