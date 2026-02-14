/**
 * Minimal vitest config for pure utility tests that don't need jsdom/MSW/React.
 * Usage: npx vitest run --config vitest.config.unit.ts src/lib/__tests__/tar.test.ts
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**/*', 'node_modules/**/*'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
