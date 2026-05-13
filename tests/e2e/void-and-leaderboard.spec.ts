import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';
import postgres from 'postgres';

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';

test.beforeEach(async () => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE ledger_entry, bet, membership, market, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
  await sql.end();
});

test('founder voids a market with bets — joiner gets refund and shows up on leaderboard', async ({
  browser,
}) => {
  const founderCtx = await browser.newContext();
  const founder = await founderCtx.newPage();
  await signInAs(founder, 'founder@example.com');
  await founder.waitForURL('**/teams');
  await founder.getByRole('link', { name: 'Create team' }).click();
  await founder.getByLabel('Team name').fill('Refund Crew');
  await founder.getByRole('button', { name: 'Create team' }).click();
  await founder.waitForURL((url) => /\/t\//.test(url.pathname) && !url.pathname.endsWith('/new'));
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
  await joiner.waitForURL((url) => /\/t\//.test(url.pathname) && !url.pathname.endsWith('/new'));

  // Founder creates a market with lockup far in the future so it stays open and voidable.
  await founder.goto(teamUrl);
  await founder.getByRole('link', { name: 'New market' }).click();
  await founder.getByLabel('Title').fill('Will rain ruin Sunday?');
  const toLocal = (offsetSec: number): string => {
    const d = new Date(Date.now() + offsetSec * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  await founder.getByLabel('Lockup time (bets close)').fill(toLocal(60 * 60));
  await founder.getByLabel('Resolution time (when you call it)').fill(toLocal(2 * 60 * 60));
  await founder.getByRole('button', { name: 'Create market' }).click();
  await founder.waitForURL((url) => /\/markets\//.test(url.pathname) && !url.pathname.endsWith('/new'));
  const marketUrl = founder.url();

  // Joiner places a 4-doughnut bet on Yes.
  await joiner.goto(marketUrl);
  await joiner.getByLabel('Amount (🍩)').fill('4');
  await joiner.getByRole('button', { name: 'Bet Yes' }).click();
  await joiner.waitForLoadState('networkidle');

  await joiner.goto(teamUrl);
  await expect(joiner.getByText('🍩 8').first()).toBeVisible();

  // Founder voids the market.
  await founder.goto(marketUrl);
  await founder.getByRole('button', { name: 'Void market' }).click();
  await founder.waitForLoadState('networkidle');

  // Joiner's balance is back to 12.
  await joiner.goto(teamUrl);
  await expect(joiner.getByText('🍩 12').first()).toBeVisible();

  // Leaderboard shows both members.
  await joiner.getByRole('link', { name: 'Leaderboard' }).click();
  await joiner.waitForURL(/\/leaderboard$/);
  await expect(joiner.getByText(/Founder/)).toBeVisible();
  await expect(joiner.getByText(/Joiner/)).toBeVisible();

  await founderCtx.close();
  await joinerCtx.close();
});
