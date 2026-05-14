import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';
import postgres from 'postgres';

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';

test.beforeEach(async () => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE ledger_entry, bet, notification, comment, membership, market, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
  await sql.end();
});

test('two users exchange comments, see notifications, browse profile + activity', async ({
  browser,
}) => {
  const founderCtx = await browser.newContext();
  const founder = await founderCtx.newPage();
  await signInAs(founder, 'founder@example.com');
  await founder.waitForURL('**/teams');
  await founder.getByRole('link', { name: 'Create team' }).click();
  await founder.getByLabel('Team name').fill('Social Crew');
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

  await founder.goto(teamUrl);
  await founder.getByRole('link', { name: 'New market' }).click();
  await founder.getByLabel('Title').fill('Talk about this');
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

  // Joiner sees the "New market" notification (badge >= 1).
  await joiner.goto(teamUrl);
  await expect(joiner.getByLabel(/unread notifications/)).toBeVisible();

  // Joiner posts a comment.
  await joiner.goto(marketUrl);
  await joiner.locator('input[name="body"]').fill('Looks interesting!');
  await joiner.getByRole('button', { name: 'Post' }).click();
  await joiner.waitForLoadState('networkidle');

  // Founder sees the comment notification.
  await founder.goto(teamUrl);
  await expect(founder.getByLabel(/unread notifications/)).toBeVisible();

  // Activity feed shows the create + comment.
  await joiner.goto(teamUrl);
  await joiner.getByRole('link', { name: 'Activity' }).click();
  await joiner.waitForURL(/\/activity$/);
  await expect(joiner.getByText(/New market: Talk about this/)).toBeVisible();
  await expect(joiner.getByText(/commented on Talk about this/)).toBeVisible();

  // Profile page for joiner.
  await joiner.goto(teamUrl);
  await joiner.getByRole('link', { name: 'My profile' }).click();
  await joiner.waitForURL(/\/me$/);
  await expect(joiner.getByRole('heading', { name: /You on Social Crew/ })).toBeVisible();

  await founderCtx.close();
  await joinerCtx.close();
});
