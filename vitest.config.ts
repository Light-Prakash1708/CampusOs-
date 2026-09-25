import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` throws outside a React Server Component. Tests exercise
      // these modules directly, so it is stubbed here.
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
});
