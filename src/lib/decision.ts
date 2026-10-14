import type { ForecastModel, PowderDecision, WeatherSnapshot } from '../types';

export function median(values: number[]): number | null {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (ordered.length === 0) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function summarizeModels(models: ForecastModel[]) {
  const valid = models.filter((model) => model.complete && model.snowfallCm !== null
    && Number.isFinite(model.snowfallCm) && model.snowfallCm >= 0);
  const snow = valid.flatMap((model) => model.snowfallCm === null ? [] : [model.snowfallCm]);
  const metric = (key: 'tempC' | 'windKph' | 'rainMm') =>
    median(valid.flatMap((model) => model[key] === null ? [] : [model[key]]));
  return {
    minCm: snow.length ? Math.min(...snow) : null,
    maxCm: snow.length ? Math.max(...snow) : null,
    typicalCm: median(snow),
    tempC: metric('tempC'),
    windKph: metric('windKph'),
    rainMm: metric('rainMm'),
  };
}

/** A transparent heuristic, not a probability or slope-safety assessment. */
export function evaluatePowder(
  snapshot: WeatherSnapshot,
  thresholdCm = 20,
  now = new Date(),
): PowderDecision {
  const threshold = Number.isFinite(thresholdCm) && thresholdCm > 0 ? thresholdCm : 20;
  const summary = summarizeModels(snapshot.models);
  const { minCm, maxCm, typicalCm } = summary;
  const snowModels = snapshot.models.filter((model) => model.complete && model.snowfallCm !== null
    && Number.isFinite(model.snowfallCm) && model.snowfallCm >= 0);
  // One warm/wet/windy model is worth inspecting even when the median looks good.
  const worst = (key: 'tempC' | 'rainMm' | 'windKph') =>
    snowModels.length === 0 || snowModels.some((model) => model[key] === null || !Number.isFinite(model[key]))
      ? null : Math.max(...snowModels.map((model) => model[key] as number));
  const tempC = worst('tempC');
  const rainMm = worst('rainMm');
  const windKph = worst('windKph');
  const fetchedAgeHours = (now.getTime() - new Date(snapshot.updatedAt).getTime()) / 3_600_000;
  const fresh = Number.isFinite(fetchedAgeHours) && fetchedAgeHours >= -0.1 && fetchedAgeHours <= 6;
  const spread = minCm === null || maxCm === null ? null : maxCm - minCm;
  const agreement = spread !== null && spread <= Math.max(10, (typicalCm ?? 0) * 0.4);
  const confidence = snowModels.length !== 3 ? 'unknown' : !fresh ? 'low' : agreement ? 'high' : 'medium';
  const quality = tempC === null || rainMm === null ? 'unknown'
    : tempC > 1 || rainMm >= 2 ? 'rain'
    : tempC > -2 || rainMm > 0.5 ? 'mixed' : 'dry';
  const confidenceLabel = confidence === 'high' ? 'Models agree'
    : confidence === 'medium' ? 'Mixed forecasts'
    : confidence === 'unknown' ? 'Agreement unknown' : 'Needs refresh';
  const qualityLabel = quality === 'dry' ? 'Cold snow potential'
    : quality === 'mixed' ? 'Heavier snow possible'
    : quality === 'rain' ? 'Rain or wet snow risk' : 'Snow quality unknown';
  const result = (status: PowderDecision['status'], reason: string): PowderDecision => ({
    status,
    title: status === 'go' ? 'Worth the trip' : status === 'maybe' ? 'Keep an eye on it' : 'Save it for another day',
    reason, confidence, confidenceLabel, quality, qualityLabel, minCm, maxCm, typicalCm,
  });

  const operationsVerified = snapshot.operations.verifiedForDate === snapshot.date;
  if (operationsVerified && snapshot.operations.status === 'closed') {
    return result('skip', 'Relevant terrain is reported closed for this date.');
  }
  if (!fresh) return result('maybe', 'Forecasts need refreshing before deciding.');
  if (operationsVerified && snapshot.operations.status === 'hold') {
    return result('maybe', 'Relevant lifts are on hold; check access before travelling.');
  }
  if (snowModels.length === 3 && maxCm !== null && maxCm < threshold) {
    return result('skip', `All three forecasts fall below your ${threshold} cm threshold.`);
  }
  if (snowModels.length < 3) {
    return result('maybe', 'Three complete forecasts are needed to compare this overnight window.');
  }
  if (!operationsVerified || snapshot.operations.status === 'unknown') {
    return result('maybe', 'Check official lift and terrain access for your trip date.');
  }
  if (quality === 'rain') return result('maybe', 'Rain or wet snow could reduce the powder quality.');
  if (quality === 'mixed') return result('maybe', 'Warmer conditions could produce heavier snow; inspect the forecasts.');
  if (tempC === null || windKph === null || rainMm === null) {
    return result('maybe', 'Temperature, rain or wind data is missing.');
  }
  if (windKph >= 40) return result('maybe', 'Strong forecast wind could affect lifts and exposed snow.');
  if (minCm !== null && minCm >= threshold && snowModels.length === 3 && agreement) {
    return result('go', `All three forecasts clear ${threshold} cm with confirmed terrain access.`);
  }
  return result('maybe', `Forecasts disagree on meeting your ${threshold} cm threshold.`);
}

export const getDecision = evaluatePowder;
