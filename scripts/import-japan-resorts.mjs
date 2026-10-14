import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCatalogue } from './catalogue-format.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceUrl = 'https://tiles.openskimap.org/geojson/ski_areas.geojson';
const metadataUrl = 'https://tiles.openskimap.org/metadata.json';
const cache = join(tmpdir(), 'powder-chaser-openskidata');
const args = process.argv.slice(2);
const argument = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const input = argument('--input');
const metadataInput = argument('--metadata');
const output = resolve(argument('--output') ?? join(repository, 'src/data/japan-resorts.json'));
let bytes;
let upstreamMetadata;
let importedAt;

if (input) {
  if (!metadataInput) throw new Error('Use --metadata with --input to pin the source build timestamp.');
  bytes = await readFile(resolve(input));
  upstreamMetadata = JSON.parse(await readFile(resolve(metadataInput), 'utf8'));
  importedAt = new Date().toISOString();
} else {
  await mkdir(cache, { recursive: true });
  const dataPath = join(cache, 'ski_areas.geojson');
  const metadataPath = join(cache, 'metadata.json');
  const recordPath = join(cache, 'download.json');
  let downloadRecord;
  try { downloadRecord = JSON.parse(await readFile(recordPath, 'utf8')); } catch { /* First import. */ }
  const age = downloadRecord ? Date.now() - Date.parse(downloadRecord.downloadedAt) : Infinity;
  const fresh = age >= 0 && age < 24 * 60 * 60 * 1000;
  if (!fresh && args.includes('--download')) {
    // OpenSkiData permits automated dataset downloads at most once per day.
    const metadataResponse = await fetch(metadataUrl, { signal: AbortSignal.timeout(30_000) });
    if (!metadataResponse.ok) throw new Error(`Metadata download failed: ${metadataResponse.status}`);
    const metadataText = await metadataResponse.text();
    upstreamMetadata = JSON.parse(metadataText);
    const dataResponse = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) });
    if (!dataResponse.ok) throw new Error(`Catalogue download failed: ${dataResponse.status}`);
    bytes = Buffer.from(await dataResponse.arrayBuffer());
    downloadRecord = { downloadedAt: new Date().toISOString() };
    await writeFile(dataPath, bytes);
    await writeFile(metadataPath, metadataText);
    await writeFile(recordPath, JSON.stringify(downloadRecord));
  } else {
    try {
      await stat(dataPath);
      bytes = await readFile(dataPath);
      upstreamMetadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    } catch { throw new Error('No cached catalogue. Run with --download once, or use --input and --metadata.'); }
  }
  importedAt = downloadRecord.downloadedAt;
}

if (typeof upstreamMetadata?.run?.finishedAt !== 'string'
  || !Number.isFinite(Date.parse(upstreamMetadata.run.finishedAt))) {
  throw new Error('Source metadata has no valid build timestamp; review the schema.');
}
if (upstreamMetadata?.files?.geojson?.skiAreas !== bytes.length) {
  throw new Error('Dataset size differs from source metadata. Download a matching build before importing.');
}
const { resorts, counts } = normalizeCatalogue(JSON.parse(bytes.toString('utf8')));
const result = {
  metadata: {
    name: 'OpenSkiData Japan downhill ski-area extract', sourceUrl, metadataUrl,
    sourceBuildAt: upstreamMetadata.run.finishedAt,
    osmDataAt: upstreamMetadata.source?.openStreetMap?.dataTimestamp ?? null,
    formatVersion: upstreamMetadata.formatVersion, importedAt,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    licence: 'ODbL-1.0', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: "OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL), Skimap.org, Who's On First, © Mapterhorn",
    ...counts, includedSourceAreas: resorts.length,
    unknownStatusAreas: resorts.filter(resort => resort.catalogueStatus === 'unknown').length,
    missingElevationAreas: resorts.filter(resort => resort.elevationSource === 'unknown').length,
    missingHomepageAreas: resorts.filter(resort => !resort.officialUrl).length,
    prefectureCount: new Set(resorts.map(resort => resort.region)).size,
    coverage: 'Named downhill ski areas in the available Japan source catalogue. Source may have gaps, duplicates or outdated operating status; seasonal lift access is unverified.',
  },
  resorts,
};
await mkdir(dirname(output), { recursive: true });
// Keep each resort on one line so updates remain readable without a huge runtime file.
await writeFile(output, `{"metadata": ${JSON.stringify(result.metadata, null, 2)},\n"resorts": [\n${resorts.map(resort => JSON.stringify(resort)).join(',\n')}\n]}\n`);
console.log(`Imported ${resorts.length} Japanese downhill ski areas across ${result.metadata.prefectureCount} prefectures.`);
console.log(`Build ${result.metadata.sourceBuildAt}; ${result.metadata.unknownStatusAreas} unknown statuses, ${result.metadata.missingElevationAreas} missing elevations.`);
