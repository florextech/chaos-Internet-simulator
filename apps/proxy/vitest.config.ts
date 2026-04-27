import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@chaos-internet-simulator/core':
        fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@chaos-internet-simulator/presets':
        fileURLToPath(new URL('../../packages/presets/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});
