import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    outDir: 'dist', emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'japan-catalogue', test: /[\\/]src[\\/]data[\\/]japan-resorts\.json$/ }],
        },
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
