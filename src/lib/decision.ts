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
  const threeModels = snapshot.models.length === 3 && snowModels.length === 3
    && new Set(snowModels.map((model) => model.id)).size === 3;
  // One warm/wet/windy model is worth inspecting even when the median looks good.
  const worst = (key: 'tempC' | 'rainMm' | 'windKph') =>
    snowModels.length === 0 || snowModels.some((model) => model[key] === null || !Number.isFinite(model[key])
      || (key !== 'tempC' && (model[key] as number) < 0))
      ? null : Math.max(...snowModels.map((model) => model[key] as number));
  const tempC = worst('tempC');
  const rainMm = worst('rainMm');
  const windKph = worst('windKph');
  const fresh = [snapshot.updatedAt, ...snapshot.models.map((model) => model.updatedAt)].every((updatedAt) => {
    const ageHours = (now.getTime() - new Date(updatedAt).getTime()) / 3_600_000;
    return Number.isFinite(ageHours) && ageHours >= -0.1 && ageHours <= 6;
  });
  const expectedEnd = new Date(`${snapshot.date}T08:00:00+09:00`).getTime();
  const sameWindow = Number.isFinite(expectedEnd)
    && new Date(snapshot.window.end).getTime() === expectedEnd
    && new Date(snapshot.window.start).getTime() === expectedEnd - 14 * 3_600_000;
  const spread = minCm === null || maxCm === null ? null : maxCm - minCm;
  const agreement = spread !== null && spread <= Math.max(10, (typicalCm ?? 0) * 0.4);
  const confidence = !threeModels || !sameWindow ? 'unknown' : !fresh ? 'low' : agreement ? 'high' : 'medium';
  const quality = tempC === null || rainMm === null ? 'unknown'
    : tempC > 1 || rainMm >= 2 ? 'rain'
    : tempC > -2 || rainMm > 0.5 ? 'mixed' : 'dry';
  const confidenceLabel = confidence === 'high' ? 'Models agree'
    : confidence === 'medium' ? 'Mixed forecasts'
    : confidence === 'unknown' ? 'Agreement unknown' : 'Needs refresh';
  const qualityLabel = quality === 'dry' ? 'Cold snow potential'
    : quality === 'mixed' ? 'Heavier snow possible'
    : quality === 'rain' ? 'Rain or wet snow risk' : 'Snow quality unknown';
  const operationsVerified = snapshot.operations.verifiedForDate === snapshot.date;
  const accessStatus = operationsVerified && snapshot.operations.status !== 'unknown'
    ? snapshot.operations.status : 'unconfirmed';
  const access: PowderDecision['access'] = {
    status: accessStatus,
    label: accessStatus === 'open' ? 'Confirmed open'
      : accessStatus === 'hold' ? 'Lifts on hold'
      : accessStatus === 'closed' ? 'Terrain closed' : 'Awaiting confirmation',
    reason: accessStatus === 'open' ? 'Relevant terrain is confirmed open for this date.'
      : accessStatus === 'hold' ? 'Relevant lifts are on hold; check access before travelling.'
      : accessStatus === 'closed' ? 'Relevant terrain is reported closed for this date.'
      : 'Check official lift and terrain access for your trip date.',
  };
  const outlookResult = (status: PowderDecision['outlook']['status'], reason: string): PowderDecision['outlook'] => ({
    status,
    label: status === 'promising' ? 'Promising' : status === 'borderline' ? 'Borderline'
      : status === 'low' ? 'Low' : 'Unknown',
    reason,
  });
  const weatherOutlook = (): PowderDecision['outlook'] => {
    if (!sameWindow) return outlookResult('unknown', 'Forecast window does not match the selected ski morning.');
    if (!fresh) return outlookResult('unknown', 'Forecasts need refreshing before deciding.');
    if (!threeModels) return outlookResult('unknown', 'Three distinct complete forecasts are needed for this overnight window.');
    if (tempC === null || windKph === null || rainMm === null) {
      return outlookResult('unknown', 'Temperature, rain or wind data is missing.');
    }
    if (maxCm !== null && maxCm < threshold) {
      return outlookResult('low', `All three forecasts fall below your ${threshold} cm threshold.`);
    }
    const concerns = [
      ...(quality === 'rain' ? ['Rain or wet snow could reduce powder quality.']
        : quality === 'mixed' ? ['Warmer conditions could produce heavier snow.'] : []),
      ...(windKph >= 40 ? ['Strong forecast wind could affect lifts and exposed snow.'] : []),
    ];
    if (concerns.length) return outlookResult('borderline', concerns.join(' '));
    if (minCm !== null && minCm >= threshold && agreement) {
      return outlookResult('promising', `All three forecasts clear ${threshold} cm with cold conditions and no strong wind signal.`);
    }
    return outlookResult('borderline', minCm !== null && minCm >= threshold
      ? 'All three forecasts clear your threshold, but snowfall amounts vary widely.'
      : `Forecasts disagree on meeting your ${threshold} cm threshold.`);
  };
  const outlook = weatherOutlook();
  const result = (status: PowderDecision['status'], reason: string): PowderDecision => ({
    status,
    title: status === 'go' ? 'Worth the trip' : status === 'maybe' ? 'Keep an eye on it' : 'Save it for another day',
    reason, outlook, access, confidence, confidenceLabel, quality, qualityLabel, minCm, maxCm, typicalCm,
  });

  if (operationsVerified && snapshot.operations.status === 'closed') {
    return result('skip', 'Relevant terrain is reported closed for this date.');
  }
  if (!sameWindow) return result('maybe', outlook.reason);
  if (!fresh) return result('maybe', 'Forecasts need refreshing before deciding.');
  if (operationsVerified && snapshot.operations.status === 'hold') {
    return result('maybe', 'Relevant lifts are on hold; check access before travelling.');
  }
  if (threeModels && maxCm !== null && maxCm < threshold) {
    return result('skip', `All three forecasts fall below your ${threshold} cm threshold.`);
  }
  if (!threeModels) {
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
  if (minCm !== null && minCm >= threshold && agreement) {
    return result('go', `All three forecasts clear ${threshold} cm with confirmed terrain access.`);
  }
  return result('maybe', outlook.reason);
}

export const getDecision = evaluatePowder;
