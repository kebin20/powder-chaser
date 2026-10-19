type SourceCatalogue = typeof import('./japan-resorts.json');
type SourceResort = SourceCatalogue['resorts'][number];
export interface Catalogue {
  metadata: SourceCatalogue['metadata'];
  // JSON inference produces a union for records with different nullable fields;
  // widen those fields independently without changing the source's schema.
  resorts: { [Key in keyof SourceResort]: SourceResort[Key] }[];
}

/** Ordered transport fields; canonical JSON remains the editable database. */
export type PackedResort = [
  name: string, regionIndex: number, aliases: string[], locality: string | null,
  latitude: number, longitude: number, baseElevationM: number | null,
  upperElevationM: number | null, officialUrl: string | null,
  unknownStatus: 0 | 1, sourceIds: string[],
];

export interface PackedCatalogue {
  version: 1;
  metadata: Catalogue['metadata'];
  regions: [english: string, japanese: string][];
  rows: PackedResort[];
}

/** Decode trusted build output; the build verifies every field against source. */
export function decodeCatalogue(packed: PackedCatalogue): Catalogue {
  if (packed.version !== 1) throw new Error('Unsupported compact catalogue version.');
  return {
    metadata: packed.metadata,
    resorts: packed.rows.map(([
      name, regionIndex, aliases, locality, latitude, longitude, baseElevationM,
      upperElevationM, officialUrl, unknownStatus, sourceIds,
    ]) => {
      const primarySource = sourceIds[0];
      const [region, regionJapanese] = packed.regions[regionIndex];
      return {
        id: primarySource.replace(/[:/]/g, '-'), name, region, regionJapanese,
        aliases, locality, latitude, longitude, baseElevationM, upperElevationM,
        elevationSource: baseElevationM === null ? 'unknown' : 'mapped',
        officialUrl, catalogueStatus: unknownStatus ? 'unknown' : 'operating', sourceIds,
        sourceUrl: primarySource.startsWith('osm:')
          ? `https://www.openstreetmap.org/${primarySource.slice(4)}`
          : `https://skimap.org/skiareas/view/${primarySource.slice(7)}`,
      };
    }),
  };
}
