import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const originalDirectory = fileURLToPath(new URL('../public/images/', import.meta.url));
const assetDirectory = fileURLToPath(new URL('../src/assets/', import.meta.url));
await mkdir(assetDirectory, { recursive: true });

// Preserve native dimensions and transparent edges; Vite hashes these files.
// Original PNG URLs remain available for previously installed app versions.
for (const name of ['snow-cloud', 'snowy-tree']) {
  await sharp(`${originalDirectory}${name}.png`)
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(`${assetDirectory}${name}.webp`);
}
process.stdout.write('Optimized both static hero illustrations as WebP.\n');
