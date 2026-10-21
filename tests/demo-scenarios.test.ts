import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_SCENARIOS, getDemoError, getDemoSnapshot, hasDemoScenario, normalizeDemoScenario, type DemoScenarioId } from '../src/data/demo';
import { CURATED_RESORTS, RESORTS } from '../src/data/resorts';
import { addDays, japanDate } from '../src/lib/dates';
import { evaluatePowder } from '../src/lib/decision';
import { getWeatherSnapshot } from '../src/lib/weather';

const now = new Date('2026-10-21T01:00:00Z');
const date = addDays(japanDate(now), 1);
const resort = CURATED_RESORTS[0];
const imported = RESORTS.find(value => value.catalogueSource === 'openskidata')!;
const snapshot = (scenarioId: DemoScenarioId, elevation: 'upper' | 'base' = 'upper', selectedDate = date) => getDemoSnapshot(resort, selectedDate, elevation, now, scenarioId);

describe('Winter Demo scenarios', () => {
  it('preserves the original eight resort examples and the four-argument API', () => {
    expect(RESORTS.filter(value => hasDemoScenario(value))).toHaveLength(8);
    expect(getDemoSnapshot(resort, date, 'upper', now).models.map(model => model.snowfallCm)).toEqual([28, 34, 31]);
    expect(hasDemoScenario(imported)).toBe(false);
    expect(() => getDemoSnapshot(imported, date, 'upper', now)).toThrow(/no winter demo/);
    const base = getDemoSnapshot(CURATED_RESORTS.find(value => value.id === 'kagura')!, date, 'base', now);
    expect(base.models.every(model => model.rainMm! >= 3 && model.tempC! >= 2)).toBe(true);
  });

  it('makes every explicit test scenario available at catalogue resorts with an explicit fiction label', () => {
    for (const scenario of DEMO_SCENARIOS.filter(value => !['resort-default', 'connection-error'].includes(value.id))) {
      expect(hasDemoScenario(imported, scenario.id)).toBe(true);
      const result = getDemoSnapshot(imported, date, 'upper', now, scenario.id);
      expect(result.resortId).toBe(imported.id);
      expect(result.mode).toBe('demo');
      expect(result.report.fictional).toBe(true);
      expect(result.models.every(model => model.label.includes('simulated') && model.issuedAt === null)).toBe(true);
      expect(result.warnings.some(warning => warning.includes('not specific to'))).toBe(true);
    }
  });

  it('normalizes untrusted preferences to a supported scenario without prototype matches', () => {
    for (const scenario of DEMO_SCENARIOS) expect(normalizeDemoScenario(scenario.id)).toBe(scenario.id);
    for (const value of [null, undefined, {}, 4, ['wind'], 'unknown', '__proto__', 'constructor']) {
      expect(normalizeDemoScenario(value)).toBe('resort-default');
    }
  });

  it('provides cold, heavy powder at both elevations and both selectable mornings', () => {
    for (const elevation of ['upper', 'base'] as const) {
      for (const selectedDate of [date, addDays(date, 1)]) {
        const result = snapshot('powder', elevation, selectedDate);
        const decision = evaluatePowder(result, 20, now);
        expect(decision.status).toBe('go');
        expect(decision.quality).toBe('dry');
        expect(result.minCm).toBeGreaterThanOrEqual(20);
        expect(result.operations).toMatchObject({ status: 'open', verifiedForDate: selectedDate });
      }
    }
  });

  it('exposes light snowfall as a low outlook with open terrain and a skip decision', () => {
    for (const elevation of ['upper', 'base'] as const) {
      for (const selectedDate of [date, addDays(date, 1)]) {
        const result = snapshot('light-snow', elevation, selectedDate);
        expect(result.models.every(model => model.snowfallCm !== null && model.snowfallCm < 20)).toBe(true);
        expect(evaluatePowder(result, 20, now)).toMatchObject({ status: 'skip', outlook: { status: 'low' }, access: { status: 'open' } });
      }
    }
  });

  it('keeps promising powder independent from unconfirmed lift access', () => {
    const result = snapshot('unconfirmed');
    expect(result.operations).toMatchObject({ status: 'unknown', verifiedForDate: null, updatedAt: null });
    expect(evaluatePowder(result, 20, now)).toMatchObject({ status: 'maybe', outlook: { status: 'promising' }, access: { status: 'unconfirmed' } });
    expect(result.report.fictional).toBe(true);
    expect(result.report.updatedAt).toBe(now.toISOString());
  });

  it('makes disagreement visible instead of asserting model agreement', () => {
    const result = snapshot('disagreement');
    expect(result.minCm).toBeLessThan(20);
    expect(result.maxCm).toBeGreaterThan(20);
    expect(evaluatePowder(result, 20, now)).toMatchObject({ status: 'maybe', confidence: 'medium' });
  });

  it('keeps upper-mountain snow separate from warm rain at the base', () => {
    const upper = snapshot('rain');
    const base = snapshot('rain', 'base');
    expect(evaluatePowder(upper, 20, now).quality).toBe('dry');
    expect(evaluatePowder(base, 20, now)).toMatchObject({ status: 'maybe', quality: 'rain' });
    expect(base.models.every(model => model.tempC! > 1 && model.rainMm! >= 2)).toBe(true);
    expect(upper.models.every(model => model.tempC! < -2 && model.rainMm === 0)).toBe(true);
  });

  it('sets actual holds and closures for the chosen date despite strong snowfall', () => {
    const wind = snapshot('wind');
    expect(wind.models.every(model => model.windKph! >= 40)).toBe(true);
    expect(wind.operations.status).toBe('hold');
    expect(wind.operations.details).toMatch(/Fictional lift hold/);
    expect(evaluatePowder(wind, 20, now).status).toBe('maybe');
    const closed = snapshot('closed');
    expect(closed.operations).toMatchObject({ status: 'closed', verifiedForDate: date });
    expect(evaluatePowder(closed, 20, now).status).toBe('skip');
  });

  it('keeps original outdated retrieval times so the recommendation needs a refresh', () => {
    const result = snapshot('stale');
    expect(now.getTime() - Date.parse(result.updatedAt)).toBe(26 * 3_600_000);
    expect(result.models.every(model => model.updatedAt === result.updatedAt)).toBe(true);
    expect(result.report.updatedAt).toBe(result.updatedAt);
    expect(japanDate(new Date(result.report.updatedAt!))).not.toBe(japanDate(now));
    expect(now.getTime() - Date.parse(result.report.updatedAt!)).toBeGreaterThan(24 * 3_600_000);
    expect(result.operations.updatedAt).toBe(result.updatedAt);
    expect(result.reportUpdatedLabel).toMatch(/26 hours old/);
    expect(evaluatePowder(result, 20, now)).toMatchObject({ status: 'maybe', confidence: 'low' });
  });

  it('represents missing model data and observations as unknown, without turning them into zero snow', () => {
    const result = snapshot('missing');
    expect(result.models.filter(model => model.complete)).toHaveLength(1);
    for (const model of result.models.filter(model => !model.complete)) {
      expect(model).toMatchObject({ snowfallCm: null, tempC: null, windKph: null, rainMm: null });
    }
    expect(result.report).toMatchObject({ snowfall24hCm: null, depthCm: null, updatedAt: null, fictional: true });
    expect(result.operations).toMatchObject({ status: 'unknown', verifiedForDate: null, updatedAt: null });
    expect(result.minCm).toBe(32);
    expect(result.reportedFreshCm).toBeNull();
    expect(result.snowDepthCm).toBeNull();
    expect(evaluatePowder(result, 20, now)).toMatchObject({ status: 'maybe', confidence: 'unknown' });
  });

  it('exposes a stable simulated connection error for the UI without fabricating a snapshot', () => {
    const message = getDemoError('connection-error');
    expect(message).toMatch(/Simulated connection failure/);
    expect(() => snapshot('connection-error')).toThrow(message!);
    expect(getDemoError('powder')).toBeNull();
    expect(hasDemoScenario(imported, 'connection-error')).toBe(true);
  });

  it('does not let scenario selection mutate subsequent fixtures', () => {
    const before = snapshot('powder');
    snapshot('missing');
    snapshot('wind');
    expect(snapshot('powder')).toEqual(before);
  });
});


describe('Winter Demo provider routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Winter Demo must not query live weather.'); }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('forwards the chosen scenario, resort and elevation through the shared weather loader', async () => {
    const controller = new AbortController();
    const upper = await getWeatherSnapshot(imported, date, 'upper', 'demo', controller.signal, 'rain');
    const base = await getWeatherSnapshot(imported, date, 'base', 'demo', controller.signal, 'rain');
    expect(upper).toMatchObject({ mode: 'demo', resortId: imported.id, date, elevation: 'upper', rainMm: 0 });
    expect(base.rainMm).toBeGreaterThanOrEqual(2);
    expect(base.elevation).toBe('base');
    const closed = await getWeatherSnapshot(imported, date, 'upper', 'demo', undefined, 'closed');
    expect(closed.operations).toMatchObject({ status: 'closed', verifiedForDate: date });
    const unconfirmed = await getWeatherSnapshot(imported, date, 'upper', 'demo', undefined, 'unconfirmed');
    expect(unconfirmed.operations).toMatchObject({ status: 'unknown', verifiedForDate: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps legacy calls on the original resort examples without making a network request', async () => {
    const result = await getWeatherSnapshot(resort, date, 'upper', 'demo');
    expect(result.models.map(model => model.snowfallCm)).toEqual([28, 34, 31]);
    await expect(getWeatherSnapshot(imported, date, 'upper', 'demo')).rejects.toThrow(/no winter demo/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the simulated connection failure instead of attempting a real weather request', async () => {
    await expect(getWeatherSnapshot(imported, date, 'upper', 'demo', undefined, 'connection-error'))
      .rejects.toThrow(getDemoError('connection-error')!);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('honours cancellation before either generating demo data or reporting a simulated failure', async () => {
    const controller = new AbortController();
    const reason = new DOMException('Scenario selection changed', 'AbortError');
    controller.abort(reason);
    for (const scenarioId of ['powder', 'connection-error'] as const) {
      await expect(getWeatherSnapshot(imported, date, 'upper', 'demo', controller.signal, scenarioId)).rejects.toBe(reason);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
