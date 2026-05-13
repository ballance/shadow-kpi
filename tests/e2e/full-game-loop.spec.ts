import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';
import postgres from 'postgres';

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';
const CRON_SECRET = 'test-secret-cron-12345';

test.beforeEach(async () => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE ledger_entry, bet, membership, market, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
  await sql.end();
});

test('founder creates market, bettor bets, founder resolves, balance updates', async ({
  browser,
}) => {
  const founderCtx = await browser.newContext();
  const founder = await founderCtx.newPage();
  await signInAs(founder, 'founder@example.com');
  await founder.waitForURL('**/teams');
  await founder.getByRole('link', { name: 'Create team' }).click();
  await founder.getByLabel('Team name').fill('Game Loop Crew');
  await founder.getByRole('button', { name: 'Create team' }).click();
  await founder.waitForURL(/\/t\/[^/]+$/);
  const teamUrl = founder.url();

  const inviteUrl = await founder
    .locator('code')
    .filter({ hasText: /\/join\// })
    .first()
    .innerText();

  const joinerCtx = await browser.newContext();
  const joiner = await joinerCtx.newPage();
  await signInAs(joiner, 'joiner@example.com');
  await joiner.waitForURL('**/teams');
  await joiner.goto(inviteUrl);
  await joiner.getByRole('button', { name: 'Join team' }).click();
  await joiner.waitForURL(/\/t\/[^/]+$/);

  await founder.goto(teamUrl);
  await founder.getByRole('link', { name: 'New market' }).click();
  await founder.getByLabel('Title').fill('Will this test pass?');

  const toLocal = (offsetSec: number): string => {
    const d = new Date(Date.now() + offsetSec * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  await founder.getByLabel('Lockup time (bets close)').fill(toLocal(3600));
  await founder.getByLabel('Resolution time (when you call it)').fill(toLocal(7200));
  await founder.getByRole('button', { name: 'Create market' }).click();
  await founder.waitForURL((url) => /\/markets\//.test(url.pathname) && !url.pathname.endsWith('/new'));
  const marketUrl = founder.url();

  await joiner.goto(marketUrl);
  await joiner.getByLabel('Amount (🍩)').fill('3');
  await joiner.getByRole('button', { name: 'Bet Yes' }).click();
  await joiner.waitForURL(marketUrl);
  await joiner.waitForLoadState('networkidle');

  await joiner.goto(teamUrl);
  await expect(joiner.getByText('🍩 9').first()).toBeVisible();

  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`UPDATE market SET lockup_at = NOW() - interval '1 minute', resolves_at = NOW() - interval '30 seconds'`;
  await sql.end();

  const sweep = await founder.request.post(`http://localhost:3001/api/cron/lockup-sweep`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(sweep.status()).toBe(200);

  await founder.goto(marketUrl);
  await founder.getByRole('button', { name: 'Resolve YES' }).click();
  await founder.waitForURL(marketUrl);
  await founder.waitForLoadState('networkidle');

  await joiner.goto(teamUrl);
  await expect(joiner.getByText('🍩 12').first()).toBeVisible();

  await joiner.goto(marketUrl);
  await expect(joiner.getByText(/Joiner/)).toBeVisible();
  await expect(joiner.getByText(/Outcome:/)).toBeVisible();

  await founderCtx.close();
  await joinerCtx.close();
});
