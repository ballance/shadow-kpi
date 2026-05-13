import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'DATABASE_URL=postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e ' +
      'AUTH_URL=http://localhost:3001 ' +
      'PORT=3001 ' +
      'E2E_MODE=1 ' +
      'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
