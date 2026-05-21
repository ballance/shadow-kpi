import { test, expect } from '@playwright/test';
import postgres from 'postgres';
import { signInAs } from './helpers/auth';

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';
const WORKSPACE_ID = 'T-e2e-link';
const ADMIN_EMAIL = 'slack-admin@example.com';
const MEMBER_EMAIL = 'slack-member@example.com';

test.beforeEach(async () => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE slack_outbox, slack_user_link, slack_team_channel, slack_install, ledger_entry, bet, membership, market, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
  await sql.end();
});

test('admin installs workspace + picks channel; member links their account', async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();

  // Sign in as admin and create a team
  await signInAs(admin, ADMIN_EMAIL);
  await admin.waitForURL('**/teams');
  await admin.getByRole('link', { name: 'Create team' }).click();
  await admin.getByLabel('Team name').fill('Slack Crew');
  await admin.getByRole('button', { name: 'Create team' }).click();
  await admin.waitForURL(/\/t\/[^/]+$/);
  const teamUrl = admin.url();
  const teamId = teamUrl.match(/\/t\/([^/?]+)/)![1];

  // Capture invite URL for the member later
  const inviteUrl = (
    await admin.locator('code').filter({ hasText: /\/join\// }).first().textContent()
  )?.trim() ?? '';

  // Walk the install flow — in E2E_MODE the server bypasses Slack and goes straight to our callback
  await admin.goto(`/t/${teamId}/settings/slack`);
  await admin.getByRole('link', { name: /Add to Slack/i }).click();
  await admin.waitForURL(/settings\/slack\?installed=1/);

  // Pick the channel and save
  await admin.locator('select').nth(1).selectOption('C-general');
  await admin.getByRole('button', { name: 'Save' }).click();
  await expect(admin.getByRole('button', { name: 'Disconnect channel' })).toBeVisible();

  // Member signs in (separate context), joins team, then links Slack
  const memberCtx = await browser.newContext();
  const member = await memberCtx.newPage();
  await signInAs(member, MEMBER_EMAIL);
  await member.waitForURL('**/teams');
  await member.goto(inviteUrl);
  await member.getByRole('button', { name: 'Join team' }).click();
  await member.waitForURL(/\/t\/[^/]+$/);

  await member.goto('/profile/linked-accounts');
  await member.getByRole('link', { name: /Link Slack/i }).click();
  await member.waitForURL(/linked-accounts\?linked=1/);
  await expect(member.getByText(/linked as/i)).toBeVisible();

  // Sanity: verify the link row landed in the DB
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  const linkRows = await sql<{ slack_user_id: string }[]>`
    SELECT slack_user_id FROM slack_user_link WHERE workspace_id = ${WORKSPACE_ID}
  `;
  await sql.end();
  expect(linkRows).toHaveLength(1);
  expect(linkRows[0].slack_user_id).toBe('U-member');

  await adminCtx.close();
  await memberCtx.close();
});
