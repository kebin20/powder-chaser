/** OpenSkiData v16 normalization. No website scraping or guessed resort metadata. */
export const PREFECTURES = [
  ['Hokkaido', '北海道'], ['Aomori', '青森県'], ['Iwate', '岩手県'], ['Miyagi', '宮城県'],
  ['Akita', '秋田県'], ['Yamagata', '山形県'], ['Fukushima', '福島県'], ['Ibaraki', '茨城県'],
  ['Tochigi', '栃木県'], ['Gunma', '群馬県'], ['Saitama', '埼玉県'], ['Chiba', '千葉県'],
  ['Tokyo', '東京都'], ['Kanagawa', '神奈川県'], ['Niigata', '新潟県'], ['Toyama', '富山県'],
  ['Ishikawa', '石川県'], ['Fukui', '福井県'], ['Yamanashi', '山梨県'], ['Nagano', '長野県'],
  ['Gifu', '岐阜県'], ['Shizuoka', '静岡県'], ['Aichi', '愛知県'], ['Mie', '三重県'],
  ['Shiga', '滋賀県'], ['Kyoto', '京都府'], ['Osaka', '大阪府'], ['Hyogo', '兵庫県'],
  ['Nara', '奈良県'], ['Wakayama', '和歌山県'], ['Tottori', '鳥取県'], ['Shimane', '島根県'],
  ['Okayama', '岡山県'], ['Hiroshima', '広島県'], ['Yamaguchi', '山口県'], ['Tokushima', '徳島県'],
  ['Kagawa', '香川県'], ['Ehime', '愛媛県'], ['Kochi', '高知県'], ['Fukuoka', '福岡県'],
  ['Saga', '佐賀県'], ['Nagasaki', '長崎県'], ['Kumamoto', '熊本県'], ['Oita', '大分県'],
  ['Miyazaki', '宮崎県'], ['Kagoshima', '鹿児島県'], ['Okinawa', '沖縄県'],
];

export function safeWebsite(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function sourceId(source) {
  if (source?.type === 'openstreetmap' && /^(node|way|relation)\/\d+$/.test(source.id)) return `osm:${source.id}`;
  if (source?.type === 'skimap.org' && /^\d+$/.test(String(source.id))) return `skimap:${source.id}`;
  return null;
}

function sourcePriority(value) {
  if (value.startsWith('osm:relation/')) return 0;
  if (value.startsWith('osm:way/')) return 1;
  if (value.startsWith('osm:node/')) return 2;
  return 3;
}

function normalizedName(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[\s\p{Punctuation}]/gu, '');
}

function names(value) {
  const aliases = [...new Set(value.split(/[,;]\s*/).map(name => name.trim()).filter(Boolean))];
  const english = aliases.find(name => /[a-z]/i.test(name) && !/[\u3040-\u30ff\u3400-\u9fff]/u.test(name));
  // Skimap-only records commonly combine English with a parenthesized Japanese name.
  const combined = aliases.find(name => /^[a-z]/i.test(name));
  const display = english ?? combined?.split(/\s*[（(]/)[0].trim() ?? aliases[0];
  const parenthesized = [...value.matchAll(/[（(]([^）)]+)[）)]/g)].map(match => match[1]);
  return { name: display, aliases: [...new Set([value, ...aliases, ...parenthesized])].filter(name => name !== display) };
}

function position(feature) {
  const point = feature.properties?.viewportHint?.center
    ?? (feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null);
  if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
  const [longitude, latitude] = point;
  if (longitude < 122 || longitude > 146 || latitude < 24 || latitude > 46) return null;
  return { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
}

function elevation(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 4000
    ? Math.round(value) : null;
}

/** Prefer individual OSM areas: Skimap IDs can describe several connected areas. */
export function normalizeCatalogue(collection) {
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('Expected the OpenSkiData ski-area GeoJSON FeatureCollection.');
  }
  const counts = {
    japanFeatures: 0, excludedNonDownhill: 0, excludedLifecycle: 0,
    excludedUnnamed: 0, excludedInvalid: 0, mergedDuplicates: 0,
  };
  const byId = new Map();
  for (const feature of collection.features) {
    const properties = feature?.properties;
    const japanesePlace = properties?.places?.find(place => place.iso3166_1Alpha2 === 'JP');
    if (!japanesePlace) continue;
    counts.japanFeatures++;
    if (!properties.activities?.includes('downhill')) { counts.excludedNonDownhill++; continue; }
    if (properties.status !== 'operating' && properties.status !== null && properties.status !== undefined) {
      counts.excludedLifecycle++; continue;
    }
    if (typeof properties.name !== 'string' || !properties.name.trim()) { counts.excludedUnnamed++; continue; }
    const coordinates = position(feature);
    const sourceIds = [...new Set((properties.sources ?? []).map(sourceId).filter(Boolean))]
      .sort((a, b) => sourcePriority(a) - sourcePriority(b) || a.localeCompare(b, 'en'));
    if (!coordinates || !sourceIds.length) { counts.excludedInvalid++; continue; }
    const prefectureIndex = /^JP-\d{2}$/.test(japanesePlace.iso3166_2)
      ? Number(japanesePlace.iso3166_2.slice(3)) - 1 : -1;
    const [region, regionJapanese] = PREFECTURES[prefectureIndex] ?? ['Japan', '日本'];
    const location = japanesePlace.localized?.en?.locality;
    const { name, aliases } = names(properties.name.trim());
    const mappedBase = elevation(properties.statistics?.minElevation);
    const mappedUpper = elevation(properties.statistics?.maxElevation);
    const hasElevations = mappedBase !== null && mappedUpper !== null && mappedUpper >= mappedBase;
    const id = sourceIds[0].replace(/[:/]/g, '-');
    const sourceUrl = sourceIds[0].startsWith('osm:')
      ? `https://www.openstreetmap.org/${sourceIds[0].slice(4)}`
      : `https://skimap.org/skiareas/view/${sourceIds[0].slice(7)}`;
    const next = {
      id, name, region, regionJapanese, aliases,
      locality: typeof location === 'string' && location.trim() ? location.trim() : null,
      ...coordinates,
      baseElevationM: hasElevations ? mappedBase : null,
      upperElevationM: hasElevations ? mappedUpper : null,
      elevationSource: hasElevations ? 'mapped' : 'unknown',
      officialUrl: (properties.websites ?? []).map(safeWebsite).find(Boolean) ?? null,
      catalogueStatus: properties.status === 'operating' ? 'operating' : 'unknown',
      sourceIds, sourceUrl,
    };
    const existing = byId.get(id);
    if (existing) {
      // Never silently collapse distinct areas whose upstream source ID is shared.
      if (normalizedName(existing.name) !== normalizedName(name)
        || Math.abs(existing.latitude - next.latitude) > 0.005
        || Math.abs(existing.longitude - next.longitude) > 0.005) {
        throw new Error(`Ambiguous upstream identifier ${id}. Review the source before importing.`);
      }
      existing.aliases = [...new Set([...existing.aliases, ...aliases])];
      existing.sourceIds = [...new Set([...existing.sourceIds, ...sourceIds])];
      counts.mergedDuplicates++;
    } else byId.set(id, next);
  }
  const resorts = [...byId.values()].sort((a, b) => a.region.localeCompare(b.region, 'en')
    || a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en'));
  if (!counts.japanFeatures || !resorts.length) throw new Error('No Japanese downhill ski areas found; source schema may have changed.');
  return { resorts, counts };
}
