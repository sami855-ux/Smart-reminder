import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      exclude: [
        'src/generated/**',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.spec.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
