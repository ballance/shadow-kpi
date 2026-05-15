import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/screenshots',
  timeout: 180_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'DATABASE_URL=postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e ' +
      'CRON_SECRET=test-secret-cron-12345 ' +
      'AUTH_URL=http://localhost:3001 ' +
      'AUTH_SECRET=screenshot-run-not-a-real-secret-0000 ' +
      'E2E_MODE=1 ' +
      'sh -c "npx next build && npx next start -p 3001"',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
