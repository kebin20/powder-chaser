export interface ImportedResort {
  id: string;
  name: string;
  region: string;
  regionJapanese: string;
  aliases: string[];
  locality: string | null;
  latitude: number;
  longitude: number;
  baseElevationM: number | null;
  upperElevationM: number | null;
  elevationSource: 'mapped' | 'unknown';
  officialUrl: string | null;
  catalogueStatus: 'operating' | 'unknown';
  sourceIds: string[];
  sourceUrl: string;
}
export const PREFECTURES: string[][];
export function safeWebsite(value: unknown): string | null;
export function normalizeCatalogue(collection: unknown): {
  resorts: ImportedResort[];
  counts: {
    japanFeatures: number;
    excludedNonDownhill: number;
    excludedLifecycle: number;
    excludedUnnamed: number;
    excludedInvalid: number;
    mergedDuplicates: number;
  };
};
