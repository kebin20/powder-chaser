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
    expect(upgraded).toEqual({ version: 2, favorites: ['niseko', resort.id], resortId: resort.id, elevation: 'base', threshold: 35, mode: 'live' });
    expect(normalizePreferences(upgraded)).toEqual(upgraded);
  });
  it('retains an explicit demo choice after the upgrade', () => {
    const upgraded = normalizePreferences({ mode: 'demo' });
    expect(normalizePreferences({ ...upgraded, mode: 'demo' }).mode).toBe('demo');
  });
  it('validates identifiers and thresholds while preserving intentionally empty favourites', () => {
    expect(normalizePreferences({ favorites: [], resortId: 'missing', threshold: 500 }).favorites).toEqual([]);
    const prefs = normalizePreferences({ favorites: ['niseko', 'missing', 'niseko'], threshold: NaN });
    expect(prefs.favorites).toEqual(['niseko']);
    expect(prefs.threshold).toBe(20);
    expect(prefs.mode).toBe('live');
  });
});
