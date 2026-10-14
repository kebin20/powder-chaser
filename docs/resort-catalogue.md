# Japan resort catalogue

The catalogue contains **520 selectable ski areas across 35 prefectures** in the bundled snapshot: 519 named Japanese downhill areas from OpenSkiData, merged with seven matching curated resorts, plus the existing Grand Hirafu sampling location. Grand Hirafu and the combined Niseko United area deliberately remain separate scopes. The original eight favorite IDs and their curated sampling coordinates, heights and verified website links are retained.

This imports the full available Japan downhill extract, rather than a hand-picked list. It is **not a guarantee that every active ski resort in Japan is mapped**. Small municipal slopes, separately named areas within connected resorts, indoor slopes and ski areas with outdated source tags can appear. An `operating` tag describes the source's general lifecycle status; it does not confirm that lifts or terrain are open for a trip date.

## Source and coverage

- Source: [OpenSkiData](https://openskidata.org/), the public dataset behind [OpenSkiMap](https://openskimap.org/).
- Upstream data combines OpenStreetMap areas/relations with Skimap.org ski areas. Place metadata comes from Who's On First and mapped elevations from Mapterhorn.
- Bundled source build: **2026-10-13 23:34 UTC**; OpenStreetMap data timestamp: **2026-10-13 22:04 UTC**.
- Of 752 Japan source features, 519 named downhill areas pass the importer. It excludes nordic-only/non-downhill areas and any lifecycle other than `operating` or unknown, including abandoned, disused and proposed areas. Unnamed or invalid records are excluded rather than given invented names or locations.
- Six retained areas have unknown source operating status. The UI asks users to confirm operations.
- 38 source areas lack a valid mapped base/upper elevation pair. Their elevations stay `null`; coordinate forecasts use provider grid elevation rather than an invented resort height.
- 75 source areas have no valid homepage (74 after merging the curated metadata). The UI provides their source record instead of labeling a map/directory page as an official resort site.
- Imported mapped min/max heights are terrain estimates derived from associated runs/lifts, not surveyed resort reporting stations. Curated heights remain forecast sampling references.

Names and coordinates are bundled locally, so browsing/searching/favoriting never sends one weather request per catalogue entry. Search covers the available English/Japanese names, aliases, prefectures and localities. Existing saved favorites remain device-local and retain their IDs.

## Rebuild

The importer uses Node 24 and built-in modules. It does not add dependencies or scrape resort/commercial directory websites.

```sh
# Download once, then reuse a temporary cached snapshot for 24 hours.
node scripts/import-japan-resorts.mjs --download

# Rebuild from the cached snapshot without downloading.
node scripts/import-japan-resorts.mjs

# Reproduce from an already saved full GeoJSON and its matching metadata.
node scripts/import-japan-resorts.mjs \
  --input /path/to/ski_areas.geojson \
  --metadata /path/to/metadata.json
```

[The upstream terms](https://openskidata.org/#downloads) allow automated dataset downloading **at most once per day**. The script respects this with a temporary download record; running `--download` again within 24 hours reuses the saved files. Run deliberately when updating the catalogue, not on every app load or CI build. Vector tiles are not downloaded or used.

The script checks GeoJSON/schema requirements, exact uncompressed dataset size against the supplied metadata, Japan place codes, coordinate bounds, allowed lifecycle tags, safe HTTP(S) links and valid elevation pairs. It records the source SHA-256, build/import timestamps, counts and known coverage gaps in [the generated JSON](../src/data/japan-resorts.json).

IDs use durable upstream OSM relation/way/node identifiers, with Skimap IDs for areas that have no OSM area. OpenSkiData's per-build content hash is never used as a favorite key. Distinct OSM areas can share a Skimap identifier, so the importer retains them separately; a conflicting primary identifier stops import for review. Curated matching uses explicit OSM source IDs, not fuzzy resort-name proximity.

The upstream schema is not promised stable. Review the diff and run `npm run check` and `npm test` after importing. Renamed/restructured upstream OSM elements can still require a reviewed ID migration. Improvements should be made in OpenStreetMap or reported to the source project so a later snapshot includes them.

## Data license and attribution

The normalized extract in `src/data/japan-resorts.json`, and modifications to that database, are distributed under **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)**. The public GitHub repository provides the machine-readable derived database and the import transformation. This data license is separate from the app source code license.

Display the following attribution with the catalogue data, linking the named sources:

> OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL), Skimap.org, Who's On First, © Mapterhorn

Source links: [OpenSkiData](https://openskidata.org/), [OpenSkiMap](https://openskimap.org/), [OpenStreetMap copyright](https://www.openstreetmap.org/copyright), [Skimap.org](https://skimap.org/), [Who's On First license](https://whosonfirst.org/docs/licenses/), [Mapterhorn](https://mapterhorn.com/).

The source [schema](https://github.com/russellporter/openskidata-format) and [processing pipeline](https://github.com/russellporter/openskidata-processor) document merging, lifecycle tags, place metadata and computed elevations. The catalogue does not include historical snowfall measurements: snow cover, total snow depth and annual fresh snowfall are different quantities.
