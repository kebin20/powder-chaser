import { readFile, mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const iconDirectory = path.join(projectRoot, 'public/icons');
const source = await readFile(path.join(iconDirectory, 'icon.svg'), 'utf8');
await mkdir(iconDirectory, { recursive: true });

// Icons stay opaque so the same mark works on browser tabs and iOS home screens.
// New filenames invalidate browsers' long-lived favicon and installed-icon caches.
await writeFile(path.join(iconDirectory, 'favicon-alpine.svg'), source);
const sizes = [16, 32, 48, 192, 512];
for (const size of sizes) {
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(path.join(iconDirectory, `icon-alpine-${size}.png`));
}
await sharp(Buffer.from(source)).resize(180, 180).png().toFile(path.join(iconDirectory, 'apple-touch-icon-alpine.png'));

// Keep every part of the mark inside the maskable icon's central 80% safe zone.
const mark = source
  .replace(/<title>.*?<\/title>/s, '')
  .replace(/<rect width="512" height="512" fill="#[a-z0-9]+"\/>/i, '')
  .replace(/^<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '');
const maskableSource = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#f5f8fa"/><g transform="translate(76.8 76.8) scale(.7)">${mark}</g></svg>`;
for (const size of [192, 512]) {
  await sharp(Buffer.from(maskableSource)).resize(size, size).png().toFile(path.join(iconDirectory, `maskable-alpine-${size}.png`));
}

// ICO permits PNG-encoded frames. Keep small favicon sizes in one browser fallback.
const frames = await Promise.all([16, 32, 48].map(async (size) => ({
  size,
  data: await readFile(path.join(iconDirectory, `icon-alpine-${size}.png`)),
})));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach(({ size, data }, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
await writeFile(path.join(iconDirectory, 'favicon-alpine.ico'), Buffer.concat([header, ...frames.map(({ data }) => data)]));
// Remove only this script's previous generated set; icon.svg remains the source.
const legacyFiles = ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png',
  ...sizes.map((size) => `icon-${size}.png`), ...[192, 512].map((size) => `maskable-${size}.png`)];
for (const filename of legacyFiles) {
  try { await unlink(path.join(iconDirectory, filename)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
process.stdout.write('Generated outlined alpine favicon, app, Apple touch, and maskable icons.\n');
