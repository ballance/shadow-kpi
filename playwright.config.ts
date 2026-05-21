import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'DATABASE_URL=postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e ' +
      'CRON_SECRET=test-secret-cron-12345 ' +
      'AUTH_URL=http://localhost:3001 ' +
      'AUTH_SECRET=e2e-run-not-a-real-secret-0000000000000000 ' +
      'E2E_MODE=1 ' +
      'SLACK_APP_PUBLIC_URL=http://localhost:3001 ' +
      'SLACK_CLIENT_ID=test-client-id ' +
      'SLACK_CLIENT_SECRET=test-client-secret ' +
      'SLACK_TOKEN_ENC_KEY=MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE= ' +
      'E2E_SLACK_WORKSPACE_ID=T-e2e-link ' +
      'E2E_SLACK_WORKSPACE_NAME=MockWorkspace ' +
      'E2E_SLACK_BOT_USER_ID=Ubot ' +
      'E2E_SLACK_USER_ID=U-member ' +
      'E2E_SLACK_USER_EMAIL=slack-member@example.com ' +
      'npx next dev -p 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
