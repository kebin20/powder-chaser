import { describe, expect, it } from 'vitest';
import { getDemoSnapshot } from '../src/data/demo';
import { RESORTS } from '../src/data/resorts';
import { evaluatePowder, median } from '../src/lib/decision';
import type { WeatherSnapshot } from '../src/types';

const now = new Date('2026-01-20T12:00:00Z');
const date = '2026-01-21';
const fresh = () => getDemoSnapshot(RESORTS[0], date, 'upper', now);
const decide = (snapshot: WeatherSnapshot, threshold = 20) => evaluatePowder(snapshot, threshold, now);

describe('powder recommendations', () => {
  it('requires the three models to agree above the user threshold with cold snow and verified access', () => {
    expect(decide(fresh()).status).toBe('go');
    expect(decide(fresh(), 40).status).toBe('skip');
    expect(decide(fresh(), 32).status).toBe('maybe');
  });

  it('a verified closure overrides excellent snow, while another date is not evidence of access', () => {
    const snapshot = fresh();
    snapshot.operations.status = 'closed';
    expect(decide(snapshot).status).toBe('skip');
    snapshot.operations.verifiedForDate = '2026-01-20';
    expect(decide(snapshot).status).toBe('maybe');
  });

  it('keeps unknown access and lift holds conditional', () => {
    const snapshot = fresh();
    snapshot.operations.status = 'unknown';
    expect(decide(snapshot).reason).toMatch(/official lift/);
    snapshot.operations.status = 'hold';
    expect(decide(snapshot).reason).toMatch(/on hold/);
  });

  it('missing snowfall is unknown, not zero or confident consensus', () => {
    const snapshot = fresh();
    snapshot.models[1].snowfallCm = null;
    snapshot.models[1].complete = false;
    const result = decide(snapshot);
    expect(result.status).toBe('maybe');
    expect(result.confidence).toBe('unknown');
    expect(result.minCm).toBe(28);
    snapshot.models[2].complete = false;
    expect(decide(snapshot).confidence).toBe('unknown');
    snapshot.models[0].complete = false;
    expect(decide(snapshot).typicalCm).toBeNull();
  });

  it('does not recommend from stale forecasts, including a stale zero-snow result', () => {
    const snapshot = fresh();
    snapshot.updatedAt = '2026-01-19T00:00:00Z';
    snapshot.models.forEach((model) => { model.snowfallCm = 0; });
    expect(decide(snapshot).status).toBe('maybe');
    expect(decide(snapshot).confidence).toBe('low');
  });

  it('one wet or windy model warrants inspection even when the median is benign', () => {
    const snapshot = fresh();
    snapshot.models[2].rainMm = 4;
    expect(decide(snapshot).quality).toBe('rain');
    expect(decide(snapshot).status).toBe('maybe');
    snapshot.models[2].rainMm = 0;
    snapshot.models[2].windKph = 45;
    expect(decide(snapshot).reason).toMatch(/Strong forecast wind/);
  });

  it('does not assume snow quality when required weather variables are missing', () => {
    const snapshot = fresh();
    snapshot.models[0].tempC = null;
    expect(decide(snapshot).status).toBe('maybe');
    expect(decide(snapshot).quality).toBe('unknown');
  });

  it('shows rain at the base separately from upper-mountain snow', () => {
    const resort = RESORTS.find((value) => value.id === 'kagura')!;
    const base = getDemoSnapshot(resort, date, 'base', now);
    const upper = getDemoSnapshot(resort, date, 'upper', now);
    expect(decide(base).quality).toBe('rain');
    expect(decide(upper).quality).toBe('dry');
    expect(base.elevationM).not.toBeNull();
    expect(upper.elevationM).not.toBeNull();
    expect(base.elevationM!).toBeLessThan(upper.elevationM!);
  });

  it('reports an arithmetic comparison, never a probability', () => {
    const result = decide(fresh());
    expect(result.confidenceLabel).toBe('Models agree');
    expect(result.typicalCm).toBe(31);
    expect(median([NaN, 12, 16])).toBe(14);
  });
});
