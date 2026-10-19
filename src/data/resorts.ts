import type { Resort } from '../types';
import catalogue from './client-catalogue';

/** Sampling coordinates/elevations, not exact lift or observation stations. */
function resort(
  id: string, name: string, region: string, regionJapanese: string,
  latitude: number, longitude: number, baseElevationM: number, upperElevationM: number,
  sourceId: string | null, aliases: string[], officialUrl: string, officialReportUrl = officialUrl,
): Resort {
  const mapped = sourceId ? catalogue.resorts.find(value => value.sourceIds.includes(sourceId)) : undefined;
  return {
    id, name, region, regionJapanese, latitude, longitude, baseElevationM, upperElevationM,
    baseElevation: baseElevationM, upperElevation: upperElevationM,
    aliases: [...new Set([...aliases, ...(mapped?.aliases ?? []), ...(mapped ? [mapped.name] : [])])],
    locality: mapped?.locality ?? null,
    officialUrl, officialReportUrl, elevationSource: 'curated',
    catalogueStatus: 'operating', catalogueSource: 'curated',
    sourceIds: mapped?.sourceIds ?? [], sourceUrl: mapped?.sourceUrl ?? officialUrl,
  };
}

/** Preserve existing IDs so saved favorites survive catalogue expansion. */
export const CURATED_RESORTS: Resort[] = [
  resort('myoko', 'Akakura Kanko', 'Niigata', '新潟県', 36.887, 138.174, 740, 1500,
    'osm:way/937100226', ['赤倉観光リゾートスキー場', 'Akakan', 'Myoko'],
    'https://www.akr-ski.com/'),
  resort('kagura', 'Kagura', 'Niigata', '新潟県', 36.893, 138.776, 620, 1845,
    'osm:way/682257432', ['かぐらスキー場', 'かぐらエリア'],
    'https://www.princehotels.co.jp/ski/kagura/'),
  resort('hakuba', 'Hakuba Happo-one', 'Nagano', '長野県', 36.701, 137.824, 770, 1680,
    'osm:way/771668333', ['白馬八方尾根スキー場', 'Happo One'],
    'https://www.happo-one.jp/en/winter/'),
  resort('nozawa', 'Nozawa Onsen', 'Nagano', '長野県', 36.922, 138.457, 616, 1407,
    'osm:way/938550591', ['野沢温泉スキー場'],
    'https://en.nozawaski.com/',
    'https://en.nozawaski.com/the-mountain/moutain-info/slopes-lifts/'),
  resort('madarao', 'Madarao Mountain', 'Nagano', '長野県', 36.853, 138.289, 910, 1350,
    'osm:way/997044732', ['斑尾高原スキー場', 'Madarao Kogen'],
    'https://www.madarao.jp/ski'),
  // OpenSkiData maps Niseko United as one area. Grand Hirafu is a distinct curated
  // sampling location within that combined area, so retain both catalogue scopes.
  resort('niseko', 'Niseko Grand Hirafu', 'Hokkaido', '北海道', 42.864, 140.697, 260, 1200,
    null, ['ニセコグラン・ヒラフ', 'Grand Hirafu', 'グランヒラフ'],
    'https://www.grand-hirafu.jp/', 'https://www.grand-hirafu.jp/snow/'),
  resort('rusutsu', 'Rusutsu', 'Hokkaido', '北海道', 42.737, 140.909, 400, 994,
    'osm:way/1081650975', ['ルスツリゾートスキー場', 'Rusutsu Resort'],
    'https://rusutsu.com/en/', 'https://rusutsu.com/en/snow-and-weather-report/'),
  resort('furano', 'Furano', 'Hokkaido', '北海道', 43.343, 142.352, 235, 1074,
    'osm:way/598421263', ['富良野スキー場', 'ふらのスキー場'],
    'https://www.princehotels.com/en/ski/furano/index.html'),
];

const curatedSourceIds = new Set(CURATED_RESORTS.flatMap(value => value.sourceIds.filter(id => id.startsWith('osm:'))));
const imported: Resort[] = catalogue.resorts
  .filter(value => !value.sourceIds.some(id => curatedSourceIds.has(id)))
  .map(value => ({
    ...value,
    baseElevation: value.baseElevationM,
    upperElevation: value.upperElevationM,
    elevationSource: value.elevationSource as Resort['elevationSource'],
    catalogueStatus: value.catalogueStatus as Resort['catalogueStatus'],
    catalogueSource: 'openskidata', officialReportUrl: value.officialUrl,
  }));

export const RESORTS: Resort[] = [...CURATED_RESORTS, ...imported];
export const resorts = RESORTS;
export const RESORT_REGIONS = [...new Set(RESORTS.map(value => value.region))].sort((a, b) => a.localeCompare(b));
export const CATALOGUE_METADATA = {
  ...catalogue.metadata,
  totalResorts: RESORTS.length,
  curatedResorts: CURATED_RESORTS.length,
  mergedCuratedAreas: catalogue.resorts.length - imported.length,
  downloadUrl: 'https://github.com/kebin20/powder-chaser/blob/main/src/data/japan-resorts.json',
};

export function resortSourceUrl(value: Resort): string {
  return value.sourceUrl;
}

function searchText(value: string) {
  return value.normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{Mark}/gu, '');
}

let searchableResorts: Map<string, string> | undefined;

function searchIndex() {
  searchableResorts ??= new Map(RESORTS.map(value => [value.id,
    searchText([value.name, value.region, value.regionJapanese, value.locality ?? '', ...value.aliases].join(' ')),
  ]));
  return searchableResorts;
}

/** Search English/Japanese names, aliases, prefectures and localities together. */
export function searchResorts(query: string, region = 'All'): Resort[] {
  const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
  const index = terms.length ? searchIndex() : undefined;
  return RESORTS.filter(value => (region === 'All' || region === value.region)
    && terms.every(term => index?.get(value.id)?.includes(term)));
}
