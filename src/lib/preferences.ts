import { RESORTS } from '../data/resorts';
import { normalizeDemoScenario, type DemoScenarioId } from '../data/demo';
import type { DataMode, Elevation } from '../types';

export interface Preferences {
  version: 2;
  favorites: string[];
  resortId: string;
  elevation: Elevation;
  threshold: number;
  mode: DataMode;
  demoScenario: DemoScenarioId;
}

/** Keep the original storage key and identifiers so favourites survive upgrades. */
export function normalizePreferences(input: unknown): Preferences {
  const value = typeof input === 'object' && input !== null && !Array.isArray(input)
    ? input as Record<string, unknown> : {};
  const supported = (id: unknown): id is string => typeof id === 'string' && RESORTS.some(resort => resort.id === id);
  return {
    version: 2,
    favorites: Array.isArray(value.favorites) ? [...new Set(value.favorites.filter(supported))] : ['myoko', 'nozawa'].filter(supported),
    resortId: supported(value.resortId) ? value.resortId : RESORTS[0].id,
    elevation: value.elevation === 'base' ? 'base' : 'upper',
    threshold: typeof value.threshold === 'number' && Number.isFinite(value.threshold) && value.threshold >= 5 && value.threshold <= 50 ? value.threshold : 20,
    // Old versions persisted their automatic demo default. Upgrade it once;
    // demo selected explicitly after the upgrade remains a saved preference.
    mode: value.version === 2 && value.mode === 'demo' ? 'demo' : 'live',
    demoScenario: normalizeDemoScenario(value.demoScenario),
  };
}
