import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/**/types.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
      reporter: ['text', 'lcov'],
    },
  },
});
