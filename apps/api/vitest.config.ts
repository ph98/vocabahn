import { defineConfig } from 'vitest/config';

// Specs instantiate services directly with mocked Prisma — no Nest DI container,
// no database. Anything needing a real connection belongs in e2e instead.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
