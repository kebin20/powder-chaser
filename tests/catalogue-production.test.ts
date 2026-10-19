import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { compactCataloguePlugin, encodeCatalogue } from '../scripts/catalogue-build';
import { decodeCatalogue, type Catalogue, type PackedCatalogue } from '../src/data/catalogue-codec';
import catalogue from '../src/data/japan-resorts.json';

describe('lossless production catalogue', () => {
  it('preserves the entire source extract including aliases, precision, nulls and provenance', () => {
    const original = structuredClone(catalogue);
    const packed = encodeCatalogue(catalogue);
    expect(packed.rows).toHaveLength(catalogue.resorts.length);
    expect(packed.regions).toHaveLength(catalogue.metadata.prefectureCount);
    expect(decodeCatalogue(packed)).toEqual(original);
    expect(catalogue).toEqual(original);
  });

  it.each([
    ['new source fields', (value: Catalogue) => Object.assign(value.resorts[0], { newSourceField: 'preserve me' })],
    ['changed derived IDs', (value: Catalogue) => { value.resorts[0].id = 'changed-durable-id'; }],
    ['changed source links', (value: Catalogue) => { value.resorts[0].sourceUrl = 'https://example.com/source'; }],
    ['unsupported source identifiers', (value: Catalogue) => { value.resorts[0].sourceIds = ['future-provider:1']; }],
    ['new lifecycle statuses', (value: Catalogue) => { value.resorts[0].catalogueStatus = 'temporarily-closed'; }],
    ['new elevation classifications', (value: Catalogue) => { value.resorts[0].elevationSource = 'surveyed'; }],
  ])('fails the build for %s instead of silently changing records', (_name, change) => {
    const changed: Catalogue = structuredClone(catalogue);
    change(changed);
    expect(() => encodeCatalogue(changed)).toThrow(/review the compact format/i);
  });

  it('rejects unknown transport versions', () => {
    const packed = encodeCatalogue(catalogue);
    expect(() => decodeCatalogue({ ...packed, version: 2 } as unknown as PackedCatalogue))
      .toThrow('Unsupported compact catalogue version');
  });

  it('builds a production module whose actual default export equals the readable source database', async () => {
    const result = await build({
      configFile: false, logLevel: 'silent', plugins: [compactCataloguePlugin()],
      build: {
        write: false, minify: true,
        lib: {
          entry: fileURLToPath(new URL('../src/data/client-catalogue.ts', import.meta.url)),
          formats: ['es'], fileName: 'catalogue',
        },
      },
    });
    const bundles = Array.isArray(result) ? result : [result];
    const output = bundles.flatMap(bundle => 'output' in bundle ? bundle.output : []);
    const entry = output.find(value => value.type === 'chunk' && value.isEntry);
    if (!entry || entry.type !== 'chunk') throw new Error('No production catalogue module was built.');
    // Import the compiled artifact instead of the source wrapper, so this checks
    // the production replacement and decoder together.
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`;
    const compiled = await import(/* @vite-ignore */ moduleUrl);
    expect(compiled.default).toEqual(catalogue);
    expect(entry.code.length).toBeLessThan(JSON.stringify(catalogue).length);
  });
});
