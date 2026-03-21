import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
