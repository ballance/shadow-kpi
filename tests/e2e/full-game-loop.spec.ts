import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';
import postgres from 'postgres';

function teamIdFromUrl(url: string): string {
  const m = url.match(/\/t\/([^/]+)/);
  if (!m) throw new Error(`No team id in ${url}`);
  return m[1];
}

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';
const CRON_SECRET = 'test-secret-cron-12345';

test.beforeEach(async () => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE slack_outbox, slack_user_link, slack_team_channel, slack_install, ledger_entry, bet, membership, market, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
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

  const inviteUrl = (
    await founder
      .locator('code')
      .filter({ hasText: /\/join\// })
      .first()
      .textContent()
  )?.trim() ?? '';

  const joinerCtx = await browser.newContext();
  const joiner = await joinerCtx.newPage();
  await signInAs(joiner, 'joiner@example.com');
  await joiner.waitForURL('**/teams');
  await joiner.goto(inviteUrl);
  await joiner.getByRole('button', { name: 'Join team' }).click();
  await joiner.waitForURL(/\/t\/[^/]+$/);

  const teamId = teamIdFromUrl(teamUrl);
  {
    const seedSql = postgres(E2E_DATABASE_URL, { max: 1 });
    const [joinerRow] = await seedSql<{ id: string }[]>`
      SELECT id FROM "user" WHERE email = 'joiner@example.com'
    `;
    if (!joinerRow) throw new Error('joiner user not found in DB after sign-in');
    await seedSql`
      INSERT INTO slack_install (id, workspace_id, workspace_name, bot_token_ciphertext, bot_token_iv, bot_user_id)
      VALUES ('install-e2e', 'TE2E', 'E2E Workspace', 'placeholder-ct', 'placeholder-iv', 'Ubot')
    `;
    await seedSql`
      INSERT INTO slack_team_channel (id, team_id, workspace_id, channel_id, channel_name)
      VALUES ('stc-e2e', ${teamId}, 'TE2E', 'CE2E', 'general')
    `;
    await seedSql`
      INSERT INTO slack_user_link (id, user_id, workspace_id, slack_user_id)
      VALUES ('sul-e2e', ${joinerRow.id}, 'TE2E', 'U-joiner')
    `;
    await seedSql.end();
  }

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

  // Point A: founder returns to team dashboard — market locks in ~1 h, so "Locking soon" appears
  await founder.goto(teamUrl);
  await expect(founder.getByText('Locking soon')).toBeVisible();
  await expect(founder.getByTestId('locking-soon-list')).toBeVisible();

  await joiner.goto(marketUrl);
  await joiner.getByLabel('Amount (🪙)').fill('3');
  await joiner.getByRole('button', { name: 'Bet Yes' }).click();
  await joiner.waitForURL(marketUrl);
  await joiner.waitForLoadState('networkidle');

  await joiner.goto(teamUrl);
  await expect(joiner.getByText('🪙 9').first()).toBeVisible();

  // Point B: joiner has placed a bet — "Your open positions" should appear
  await expect(joiner.getByText('Your open positions')).toBeVisible();
  await expect(joiner.getByTestId('your-positions-list')).toBeVisible();

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
  await expect(joiner.getByText('🪙 12').first()).toBeVisible();

  // Point C: market resolved since joiner's last dashboard visit — "Resolved while you were away" appears
  await expect(joiner.getByText('Resolved while you were away')).toBeVisible();
  await expect(joiner.getByTestId('resolved-away-list')).toBeVisible();

  await joiner.goto(marketUrl);
  await expect(joiner.getByText(/Joiner/)).toBeVisible();
  await expect(joiner.getByText(/Outcome:/)).toBeVisible();

  {
    const sql2 = postgres(E2E_DATABASE_URL, { max: 1 });
    const rows = await sql2<{ dedup_key: string | null; target_kind: string }[]>`
      SELECT dedup_key, target_kind FROM slack_outbox
    `;
    await sql2.end();
    const dedupKeys = rows.map((r) => r.dedup_key).filter((k): k is string => k !== null);
    // Channel rows for created, locked, resolved
    expect(dedupKeys.find((k) => k.startsWith('MarketCreated:') && k.endsWith(':channel'))).toBeTruthy();
    expect(dedupKeys.find((k) => k.startsWith('MarketLocked:') && k.endsWith(':channel'))).toBeTruthy();
    expect(dedupKeys.find((k) => k.startsWith('MarketResolved:') && k.endsWith(':channel'))).toBeTruthy();
    // DM rows for the joiner (the only linked bettor)
    expect(dedupKeys.find((k) => k.startsWith('MarketLocked:') && k.includes(':dm:'))).toBeTruthy();
    expect(dedupKeys.find((k) => k.startsWith('MarketResolved:') && k.includes(':dm:'))).toBeTruthy();
  }

  await founderCtx.close();
  await joinerCtx.close();
});
