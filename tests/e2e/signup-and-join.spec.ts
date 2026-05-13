import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';
import postgres from 'postgres';

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';

test.beforeEach(async () => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE ledger_entry, membership, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
  await sql.end();
});

test('founder creates a team and a second user joins via invite', async ({
  browser,
}) => {
  const founderCtx = await browser.newContext();
  const founder = await founderCtx.newPage();

  await signInAs(founder, 'founder@example.com');
  await founder.waitForURL('**/teams');
  await expect(founder.getByText("You aren't on any teams yet.")).toBeVisible();

  await founder.getByRole('link', { name: 'Create team' }).click();
  await founder.getByLabel('Team name').fill('Doughnut Detectives');
  await founder.getByRole('button', { name: 'Create team' }).click();
  await founder.waitForURL(/\/t\/[^/]+$/);

  await expect(founder.getByText('🍩 12').first()).toBeVisible();
  const inviteUrl = await founder
    .locator('code')
    .filter({ hasText: /\/join\// })
    .first()
    .innerText();
  expect(inviteUrl).toContain('/join/');

  const joinerCtx = await browser.newContext();
  const joiner = await joinerCtx.newPage();
  await signInAs(joiner, 'joiner@example.com');
  await joiner.waitForURL('**/teams');

  await joiner.goto(inviteUrl);
  await expect(joiner.getByRole('heading', { name: /Join Doughnut Detectives/ })).toBeVisible();
  await joiner.getByRole('button', { name: 'Join team' }).click();
  await joiner.waitForURL(/\/t\/[^/]+$/);
  await expect(joiner.getByText('🍩 12').first()).toBeVisible();

  await joiner.goto('/teams');
  await expect(joiner.getByRole('heading', { name: 'Doughnut Detectives' })).toBeVisible();

  await founderCtx.close();
  await joinerCtx.close();
});
