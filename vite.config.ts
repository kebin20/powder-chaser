import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { compactCataloguePlugin } from './scripts/catalogue-build.ts';

export default defineConfig({
  plugins: [react(), compactCataloguePlugin()],
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    outDir: 'dist', emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'japan-catalogue', test: /[\\/]src[\\/]data[\\/](client-catalogue\.ts|catalogue-codec\.ts|japan-resorts\.json)$/ },
            { name: 'react-runtime', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
