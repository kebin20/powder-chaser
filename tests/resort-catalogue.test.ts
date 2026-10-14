import { describe, expect, it } from 'vitest';
import { normalizeCatalogue, safeWebsite } from '../scripts/catalogue-format.mjs';
import { CATALOGUE_METADATA, CURATED_RESORTS, RESORTS, RESORT_REGIONS, searchResorts } from '../src/data/resorts';
import catalogue from '../src/data/japan-resorts.json';

function area(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    type: 'Feature', geometry: { type: 'Point', coordinates: [138.2, 36.8] },
    properties: {
      name, activities: ['downhill'], status: 'operating',
      sources: [{ type: 'openstreetmap', id }],
      places: [{ iso3166_1Alpha2: 'JP', iso3166_2: 'JP-20', localized: { en: { locality: 'Example Town' } } }],
      websites: ['https://example.com/'], ...overrides,
    },
  };
}

describe('Japan resort catalogue', () => {
  it('preserves all existing favorite IDs while replacing their matching imported areas', () => {
    expect(RESORTS.slice(0, 8).map(resort => resort.id)).toEqual([
      'myoko', 'kagura', 'hakuba', 'nozawa', 'madarao', 'niseko', 'rusutsu', 'furano',
    ]);
    expect(CATALOGUE_METADATA.mergedCuratedAreas).toBe(7);
    expect(RESORTS.length).toBe(catalogue.resorts.length + 1);
    for (const curated of CURATED_RESORTS) {
      expect(RESORTS.filter(resort => resort.id === curated.id)).toHaveLength(1);
      expect(curated.elevationSource).toBe('curated');
      expect(curated.officialUrl).toMatch(/^https:\/\//);
    }
    expect(RESORTS.some(resort => resort.name === 'Niseko United')).toBe(true);
  });

  it('provides unique durable IDs, valid coordinates and provenance for the entire source extract', () => {
    expect(RESORTS.length).toBeGreaterThan(500);
    expect(new Set(RESORTS.map(resort => resort.id)).size).toBe(RESORTS.length);
    expect(RESORT_REGIONS).toHaveLength(CATALOGUE_METADATA.prefectureCount);
    expect(RESORT_REGIONS).toEqual(expect.arrayContaining(['Hokkaido', 'Nagano', 'Niigata', 'Iwate', 'Hiroshima', 'Oita']));
    for (const resort of RESORTS) {
      expect(resort.latitude).toBeGreaterThanOrEqual(24);
      expect(resort.latitude).toBeLessThanOrEqual(46);
      expect(resort.longitude).toBeGreaterThanOrEqual(122);
      expect(resort.longitude).toBeLessThanOrEqual(146);
      expect(safeWebsite(resort.sourceUrl)).toBe(resort.sourceUrl);
      if (resort.officialUrl) expect(safeWebsite(resort.officialUrl)).toBe(resort.officialUrl);
      if (resort.catalogueSource === 'openskidata') {
        expect(resort.id).toMatch(/^(osm-(node|way|relation)-\d+|skimap-\d+)$/);
        expect(resort.sourceIds.length).toBeGreaterThan(0);
      }
    }
  });

  it('searches Japanese names, English aliases and prefectures together', () => {
    expect(searchResorts('赤倉観光').map(resort => resort.id)).toContain('myoko');
    expect(searchResorts('ＨＡＫＵＢＡ 長野').map(resort => resort.id)).toContain('hakuba');
    expect(searchResorts('Akakan', 'Niigata').map(resort => resort.id)).toEqual(['myoko']);
    expect(searchResorts('Akakan', 'Hokkaido')).toEqual([]);
    expect(searchResorts('', 'Iwate').every(resort => resort.region === 'Iwate')).toBe(true);
    expect(searchResorts('this-resort-does-not-exist')).toEqual([]);
  });

  it('keeps absent elevations and unknown seasonal operating status explicit', () => {
    const withoutElevations = RESORTS.filter(resort => resort.elevationSource === 'unknown');
    expect(withoutElevations).toHaveLength(CATALOGUE_METADATA.missingElevationAreas);
    for (const resort of withoutElevations) {
      expect(resort.baseElevationM).toBeNull();
      expect(resort.upperElevationM).toBeNull();
    }
    expect(RESORTS.filter(resort => resort.catalogueStatus === 'unknown'))
      .toHaveLength(CATALOGUE_METADATA.unknownStatusAreas);
  });
});

describe('licensed source normalization', () => {
  it('excludes closed, proposed, nordic-only, foreign and unnamed entries', () => {
    const { resorts, counts } = normalizeCatalogue({ type: 'FeatureCollection', features: [
      area('way/1', 'Open Area'),
      area('way/2', 'Closed Area', { status: 'abandoned' }),
      area('way/3', 'Future Area', { status: 'proposed' }),
      area('way/4', 'Nordic Area', { activities: ['nordic'] }),
      area('way/5', 'Foreign Area', { places: [{ iso3166_1Alpha2: 'US' }] }),
      area('way/6', '', {}),
      area('way/7', 'Unknown Area', { status: null }),
    ] });
    expect(resorts.map(resort => resort.name)).toEqual(['Open Area', 'Unknown Area']);
    expect(resorts[1].catalogueStatus).toBe('unknown');
    expect(counts).toMatchObject({ japanFeatures: 6, excludedLifecycle: 2, excludedNonDownhill: 1, excludedUnnamed: 1 });
  });

  it('retains distinct OSM areas sharing a combined Skimap identifier', () => {
    const { resorts } = normalizeCatalogue({ type: 'FeatureCollection', features: [
      area('way/10', 'Area One', { sources: [{ type: 'openstreetmap', id: 'way/10' }, { type: 'skimap.org', id: 100 }] }),
      area('way/11', 'Area Two', { sources: [{ type: 'openstreetmap', id: 'way/11' }, { type: 'skimap.org', id: 100 }] }),
    ] });
    expect(resorts.map(resort => resort.id)).toEqual(['osm-way-10', 'osm-way-11']);
  });

  it('deduplicates identical source areas and rejects ambiguous source collisions', () => {
    const duplicate = area('way/10', 'Same Area');
    const result = normalizeCatalogue({ type: 'FeatureCollection', features: [duplicate, duplicate] });
    expect(result.resorts).toHaveLength(1);
    expect(result.counts.mergedDuplicates).toBe(1);
    expect(() => normalizeCatalogue({ type: 'FeatureCollection', features: [duplicate, area('way/10', 'Different Area')] }))
      .toThrow('Ambiguous upstream identifier');
  });

  it('uses documented mapped elevations only when both are valid and chooses English names without losing Japanese search aliases', () => {
    const { resorts } = normalizeCatalogue({ type: 'FeatureCollection', features: [
      area('way/20', '日本スキー場, Example Ski Area', { statistics: { minElevation: 450.4, maxElevation: 950.8 } }),
      area('way/21', 'Missing Elevation', { statistics: { minElevation: 400 } }),
      area('way/22', 'Invalid Elevation', { statistics: { minElevation: 500, maxElevation: 100 } }),
    ] });
    const mapped = resorts.find(resort => resort.id === 'osm-way-20')!;
    expect(mapped).toMatchObject({ name: 'Example Ski Area', region: 'Nagano', baseElevationM: 450, upperElevationM: 951, elevationSource: 'mapped' });
    expect(mapped.aliases).toContain('日本スキー場');
    for (const resort of resorts.filter(resort => resort.id !== mapped.id)) {
      expect(resort.baseElevationM).toBeNull();
      expect(resort.upperElevationM).toBeNull();
      expect(resort.elevationSource).toBe('unknown');
    }
  });

  it('rejects unsafe links and fails visibly if the source schema loses Japan metadata', () => {
    for (const value of ['javascript:alert(1)', 'data:text/plain,hello', 'ftp://example.com/', 'https://user:password@example.com/', '/relative', null]) {
      expect(safeWebsite(value)).toBeNull();
    }
    expect(safeWebsite('https://example.com/path')).toBe('https://example.com/path');
    expect(() => normalizeCatalogue({ type: 'FeatureCollection', features: [] })).toThrow('No Japanese downhill ski areas');
  });
});
