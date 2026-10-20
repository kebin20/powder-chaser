import { describe, expect, it } from 'vitest';
import { normalizePreferences } from '../src/lib/preferences';
import { RESORTS } from '../src/data/resorts';

describe('live-first preferences upgrade', () => {
  it('starts fresh and invalid stored values in live mode', () => {
    for (const value of [undefined, null, {}, [], 'invalid']) expect(normalizePreferences(value).mode).toBe('live');
  });
  it('migrates legacy demo once without losing valid preferences', () => {
    const resort = RESORTS.find(value => value.catalogueSource === 'openskidata')!;
    const upgraded = normalizePreferences({ favorites: ['niseko', resort.id], resortId: resort.id, elevation: 'base', threshold: 35, mode: 'demo' });
    expect(upgraded).toEqual({ version: 2, favorites: ['niseko', resort.id], resortId: resort.id, elevation: 'base', threshold: 35, mode: 'live', demoScenario: 'resort-default' });
    expect(normalizePreferences(upgraded)).toEqual(upgraded);
  });
  it('retains an explicit demo choice after the upgrade', () => {
    const upgraded = normalizePreferences({ mode: 'demo' });
    expect(normalizePreferences({ ...upgraded, mode: 'demo' }).mode).toBe('demo');
  });
  it('retains supported demo scenarios without changing the live-first upgrade', () => {
    expect(normalizePreferences({ version: 2, mode: 'demo', demoScenario: 'rain' })).toMatchObject({ version: 2, mode: 'demo', demoScenario: 'rain' });
    expect(normalizePreferences({ mode: 'demo', demoScenario: 'wind' })).toMatchObject({ mode: 'live', demoScenario: 'wind' });
    for (const demoScenario of [undefined, null, 'unknown', 2, {}, ['powder']]) {
      expect(normalizePreferences({ demoScenario }).demoScenario).toBe('resort-default');
    }
  });
  it('validates identifiers and thresholds while preserving intentionally empty favourites', () => {
    expect(normalizePreferences({ favorites: [], resortId: 'missing', threshold: 500 }).favorites).toEqual([]);
    const prefs = normalizePreferences({ favorites: ['niseko', 'missing', 'niseko'], threshold: NaN });
    expect(prefs.favorites).toEqual(['niseko']);
    expect(prefs.threshold).toBe(20);
    expect(prefs.mode).toBe('live');
  });
});
