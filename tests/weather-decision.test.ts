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

describe('separate powder and access signals', () => {
  it('keeps promising weather visible while access awaits confirmation', () => {
    const snapshot = fresh();
    snapshot.operations.status = 'unknown';
    snapshot.operations.verifiedForDate = null;
    const result = decide(snapshot);
    expect(result.status).toBe('maybe');
    expect(result.outlook.status).toBe('promising');
    expect(result.outlook.reason).toMatch(/three forecasts clear 20 cm/);
    expect(result.access.status).toBe('unconfirmed');
    expect(result.access.label).toBe('Awaiting confirmation');
  });

  it('shows rain and wind concerns even when access is unknown', () => {
    const snapshot = fresh();
    snapshot.operations.status = 'unknown';
    snapshot.models[2].rainMm = 4;
    snapshot.models[2].windKph = 45;
    const result = decide(snapshot);
    expect(result.outlook.status).toBe('borderline');
    expect(result.outlook.reason).toMatch(/Rain or wet snow/);
    expect(result.outlook.reason).toMatch(/Strong forecast wind/);
    expect(result.access.status).toBe('unconfirmed');
    expect(result.status).toBe('maybe');
  });

  it('keeps good weather independent of a closure or lift hold', () => {
    const snapshot = fresh();
    snapshot.operations.status = 'closed';
    const closure = decide(snapshot);
    expect(closure.status).toBe('skip');
    expect(closure.outlook.status).toBe('promising');
    expect(closure.access.status).toBe('closed');
    snapshot.operations.status = 'hold';
    const hold = decide(snapshot);
    expect(hold.status).toBe('maybe');
    expect(hold.outlook.status).toBe('promising');
    expect(hold.access.status).toBe('hold');
  });

  it('never carries operations confirmation from another trip date', () => {
    const snapshot = fresh();
    for (const status of ['open', 'hold', 'closed'] as const) {
      snapshot.operations.status = status;
      snapshot.operations.verifiedForDate = '2026-01-20';
      const result = decide(snapshot);
      expect(result.access.status).toBe('unconfirmed');
      expect(result.outlook.status).toBe('promising');
      expect(result.status).toBe('maybe');
    }
  });

  it('distinguishes low snowfall from a split forecast and wide amounts above the threshold', () => {
    const snapshot = fresh();
    expect(decide(snapshot, 40).outlook.status).toBe('low');
    expect(decide(snapshot, 32).outlook.status).toBe('borderline');
    snapshot.models[2].snowfallCm = 70;
    const wide = decide(snapshot);
    expect(wide.outlook.status).toBe('borderline');
    expect(wide.outlook.reason).toMatch(/amounts vary widely/);
    expect(wide.reason).not.toMatch(/disagree on meeting/);
  });

  it('requires fresh model retrievals as well as a fresh snapshot', () => {
    const snapshot = fresh();
    snapshot.models[0].updatedAt = '2026-01-19T00:00:00Z';
    expect(decide(snapshot).outlook.status).toBe('unknown');
    expect(decide(snapshot).confidence).toBe('low');
    snapshot.models[0].updatedAt = '2026-01-21T00:00:00Z';
    expect(decide(snapshot).outlook.status).toBe('unknown');
    snapshot.models[0].updatedAt = 'invalid';
    expect(decide(snapshot).outlook.status).toBe('unknown');
    expect(decide(snapshot).status).toBe('maybe');
  });

  it('does not turn incomplete weather or duplicated providers into promising powder', () => {
    const incomplete = fresh();
    incomplete.models[0].windKph = null;
    expect(decide(incomplete).outlook.status).toBe('unknown');
    expect(decide(incomplete).outlook.reason).toMatch(/data is missing/);
    incomplete.models[0].complete = false;
    expect(decide(incomplete).outlook.status).toBe('unknown');
    expect(decide(incomplete).confidence).toBe('unknown');
    const duplicated = fresh();
    duplicated.models[2].id = duplicated.models[0].id;
    expect(decide(duplicated).outlook.status).toBe('unknown');
    expect(decide(duplicated).status).toBe('maybe');
    expect(decide(duplicated).confidence).toBe('unknown');
  });

  it('does not reuse a forecast for a different ski morning', () => {
    const snapshot = fresh();
    snapshot.date = '2026-01-22';
    snapshot.operations.verifiedForDate = snapshot.date;
    const result = decide(snapshot);
    expect(result.outlook.status).toBe('unknown');
    expect(result.outlook.reason).toMatch(/selected ski morning/);
    expect(result.status).toBe('maybe');
    expect(result.confidence).toBe('unknown');
    expect(result.access.status).toBe('open');
  });

  it('rejects invalid snow and nonnegative weather fields instead of assuming benign conditions', () => {
    for (const key of ['snowfallCm', 'rainMm', 'windKph'] as const) {
      const snapshot = fresh();
      snapshot.models[0][key] = -1;
      expect(decide(snapshot).outlook.status).toBe('unknown');
      expect(decide(snapshot).status).toBe('maybe');
    }
  });
});
