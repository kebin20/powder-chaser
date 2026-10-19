import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { normalizePath, type Plugin } from 'vite';
import { decodeCatalogue, type Catalogue, type PackedCatalogue } from '../src/data/catalogue-codec.ts';

const sourcePath = fileURLToPath(new URL('../src/data/japan-resorts.json', import.meta.url));
const clientPath = normalizePath(fileURLToPath(new URL('../src/data/client-catalogue.ts', import.meta.url)));

/** Store repeated/derivable fields once without changing the licensed extract. */
export function encodeCatalogue(catalogue: Catalogue): PackedCatalogue {
  const regions: PackedCatalogue['regions'] = [];
  const regionIndexes = new Map<string, number>();
  const packed: PackedCatalogue = {
    version: 1, metadata: catalogue.metadata, regions,
    rows: catalogue.resorts.map(resort => {
      if (!/^(osm:(node|way|relation)\/\d+|skimap:\d+)$/.test(resort.sourceIds[0] ?? '')
        || !['operating', 'unknown'].includes(resort.catalogueStatus)) {
        throw new Error('Unsupported catalogue source or status; review the compact format.');
      }
      const regionKey = JSON.stringify([resort.region, resort.regionJapanese]);
      let regionIndex = regionIndexes.get(regionKey);
      if (regionIndex === undefined) {
        regionIndex = regions.length;
        regionIndexes.set(regionKey, regionIndex);
        regions.push([resort.region, resort.regionJapanese]);
      }
      return [
        resort.name, regionIndex, resort.aliases, resort.locality, resort.latitude,
        resort.longitude, resort.baseElevationM, resort.upperElevationM,
        resort.officialUrl, resort.catalogueStatus === 'unknown' ? 1 : 0, resort.sourceIds,
      ];
    }),
  };
  // Fail the build on schema drift or non-derivable values instead of dropping
  // new fields, changing source links, or guessing metadata after an import.
  if (!isDeepStrictEqual(decodeCatalogue(packed), catalogue)) {
    throw new Error('Catalogue compaction would change source records; review the compact format.');
  }
  return packed;
}

/** Only production changes representation; normal JSON imports stay untouched. */
export function compactCataloguePlugin(): Plugin {
  return {
    name: 'powder-compact-catalogue', apply: 'build', enforce: 'pre',
    transform(_code, id) {
      if (normalizePath(id.split('?')[0]) !== clientPath) return;
      this.addWatchFile(sourcePath);
      const packed = encodeCatalogue(JSON.parse(readFileSync(sourcePath, 'utf8')) as Catalogue);
      return {
        code: `import { decodeCatalogue } from './catalogue-codec';\nexport default decodeCatalogue(${JSON.stringify(packed)});\n`,
        map: null,
      };
    },
  };
}
