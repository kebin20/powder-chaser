import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
if (process.env.VITE_APP_ENV === 'staging') {
  const manifestPath = path.join(dist, 'manifest.webmanifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.name = 'Powder Chaser Staging';
  manifest.short_name = 'Powder Staging';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const indexPath = path.join(dist, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  await writeFile(indexPath, html
    .replace('name="apple-mobile-web-app-title" content="Powder Chaser"', 'name="apple-mobile-web-app-title" content="Powder Staging"')
    .replace('<title>Powder Chaser — Japan powder days</title>', '<title>Powder Chaser Staging — Japan powder days</title>'));
}
const hash = createHash('sha256');
const compiledPaths = [];
async function addFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await addFiles(filename);
    else {
      const relative = path.relative(dist, filename).split(path.sep).join('/');
      if (relative.startsWith('assets/')) compiledPaths.push(relative);
      hash.update(relative);
      hash.update(await readFile(filename));
    }
  }
}
await addFiles(dist);
const release = hash.digest('hex').slice(0, 16);
const workerPath = path.join(dist, 'sw.js');
const worker = await readFile(workerPath, 'utf8');
const marker = '__POWDER_CHASER_RELEASE__';
const assetMarker = '/* __POWDER_CHASER_ASSET_PATHS__ */ []';
if (!worker.includes(marker) || !worker.includes(assetMarker)) {
  throw new Error('Missing service worker build markers; run a fresh Vite build first.');
}
await writeFile(workerPath, worker.replace(marker, release)
  .replace(assetMarker, JSON.stringify(compiledPaths.sort())));
process.stdout.write(`Stamped offline shell release ${release} with ${compiledPaths.length} compiled assets.\n`);
