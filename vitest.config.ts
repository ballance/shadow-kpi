import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000, // testcontainers cold start
    hookTimeout: 60_000,
    pool: 'forks', // each file gets its own process — isolates DB containers
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
