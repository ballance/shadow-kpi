import { test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';
const MAGIC_LINK_DIR = path.resolve('.testcontainers');
const OUT_DIR = path.resolve('docs/img');

async function signInAs(page: import('@playwright/test').Page, email: string): Promise<void> {
  const file = path.join(MAGIC_LINK_DIR, `magic-link-${email.toLowerCase()}.txt`);
  await fs.rm(file, { force: true });

  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send me a magic link' }).click();
  await page.waitForURL((url) =>
    url.pathname.includes('check-email') || url.pathname.includes('verify-request'),
  );

  const start = Date.now();
  let url = '';
  while (Date.now() - start < 5000) {
    try {
      url = (await fs.readFile(file, 'utf8')).trim();
      if (url.length > 0) break;
    } catch {
      // not written yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!url) throw new Error(`Magic link never appeared: ${file}`);
  await page.goto(url);
}

function toLocal(offsetSec: number): string {
  const d = new Date(Date.now() + offsetSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

test.beforeAll(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE ledger_entry, bet, notification, comment, membership, market, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
  await sql.end();
});

test('capture readme screenshots', async ({ browser }) => {
  // --- Setup: founder creates team, two joiners join, founder creates a market, joiners bet ---
  const founderCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const founder = await founderCtx.newPage();
  await signInAs(founder, 'alex@example.com');
  await founder.waitForURL('**/teams');
  await founder.getByRole('link', { name: 'Create team' }).click();
  await founder.getByLabel('Team name').fill('Doughnut Crew');
  await founder.getByRole('button', { name: 'Create team' }).click();
  await founder.waitForURL((url) => /\/t\//.test(url.pathname) && !url.pathname.endsWith('/new'));
  const teamUrl = founder.url();
  const inviteUrl = await founder
    .locator('code')
    .filter({ hasText: /\/join\// })
    .first()
    .innerText();

  // Joiner 1
  const j1Ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const j1 = await j1Ctx.newPage();
  await signInAs(j1, 'jess@example.com');
  await j1.waitForURL('**/teams');
  await j1.goto(inviteUrl);
  await j1.getByRole('button', { name: 'Join team' }).click();
  await j1.waitForURL((url) => /\/t\//.test(url.pathname) && !url.pathname.endsWith('/new'));

  // Joiner 2
  const j2Ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const j2 = await j2Ctx.newPage();
  await signInAs(j2, 'sam@example.com');
  await j2.waitForURL('**/teams');
  await j2.goto(inviteUrl);
  await j2.getByRole('button', { name: 'Join team' }).click();
  await j2.waitForURL((url) => /\/t\//.test(url.pathname) && !url.pathname.endsWith('/new'));

  // Founder creates Market A (open, with bets)
  await founder.goto(teamUrl);
  await founder.getByRole('link', { name: 'New market' }).click();
  await founder.getByLabel('Title').fill('Will the Q1 deck ship by Friday?');
  await founder.getByLabel('Lockup time (bets close)').fill(toLocal(60 * 60 * 2));
  await founder.getByLabel('Resolution time (when you call it)').fill(toLocal(60 * 60 * 24));
  await founder.getByRole('button', { name: 'Create market' }).click();
  await founder.waitForURL((url) => /\/markets\//.test(url.pathname) && !url.pathname.endsWith('/new'));
  const marketAUrl = founder.url();

  // Founder creates Market B
  await founder.goto(teamUrl);
  await founder.getByRole('link', { name: 'New market' }).click();
  await founder.getByLabel('Title').fill('Will the all-hands run over?');
  await founder.getByLabel('Lockup time (bets close)').fill(toLocal(60 * 60 * 4));
  await founder.getByLabel('Resolution time (when you call it)').fill(toLocal(60 * 60 * 24));
  await founder.getByRole('button', { name: 'Create market' }).click();
  await founder.waitForURL((url) => /\/markets\//.test(url.pathname) && !url.pathname.endsWith('/new'));

  // Founder creates Market C
  await founder.goto(teamUrl);
  await founder.getByRole('link', { name: 'New market' }).click();
  await founder.getByLabel('Title').fill('Tom remembers his standup tomorrow');
  await founder.getByLabel('Lockup time (bets close)').fill(toLocal(60 * 60 * 6));
  await founder.getByLabel('Resolution time (when you call it)').fill(toLocal(60 * 60 * 24));
  await founder.getByRole('button', { name: 'Create market' }).click();
  await founder.waitForURL((url) => /\/markets\//.test(url.pathname) && !url.pathname.endsWith('/new'));

  // Joiner 1 bets YES 5 on Market A
  await j1.goto(marketAUrl);
  await j1.getByRole('button', { name: 'Bet Yes' }).click();
  await j1.waitForLoadState('networkidle');

  // Joiner 2 bets NO 3 on Market A — needs to set side + amount before clicking submit
  // The bet form has Bet Yes and Bet No buttons that submit immediately at amount 1 by default;
  // we click multiple times to build up the side pools.
  await j2.goto(marketAUrl);
  await j2.getByRole('button', { name: 'Bet No' }).click();
  await j2.waitForLoadState('networkidle');
  await j2.goto(marketAUrl);
  await j2.getByRole('button', { name: 'Bet No' }).click();
  await j2.waitForLoadState('networkidle');

  // Joiner 1 posts a comment on Market A
  await j1.goto(marketAUrl);
  await j1.locator('input[name="body"]').fill("we're on track, design's locked");
  await j1.getByRole('button', { name: 'Post' }).click();
  await j1.waitForLoadState('networkidle');

  // Joiner 2 posts a comment
  await j2.goto(marketAUrl);
  await j2.locator('input[name="body"]').fill('famous last words');
  await j2.getByRole('button', { name: 'Post' }).click();
  await j2.waitForLoadState('networkidle');

  // ============================
  // SCREENSHOTS
  // ============================
  const wait = (p: import('@playwright/test').Page) =>
    Promise.all([p.waitForLoadState('domcontentloaded'), p.waitForLoadState('networkidle')]);

  // --- DARK mode (default for these contexts) ---
  await founder.emulateMedia({ colorScheme: 'dark' });
  await j1.emulateMedia({ colorScheme: 'dark' });

  // hero.png = market detail with split OddsBar
  await j1.goto(marketAUrl);
  await wait(j1);
  await j1.screenshot({ path: path.join(OUT_DIR, 'hero.png'), fullPage: false });
  await j1.screenshot({ path: path.join(OUT_DIR, 'market-detail.png'), fullPage: false });

  // dashboard.png
  await j1.goto(teamUrl);
  await wait(j1);
  await j1.screenshot({ path: path.join(OUT_DIR, 'dashboard.png'), fullPage: false });

  // activity.png
  await j1.getByRole('link', { name: 'Activity' }).click();
  await j1.waitForURL(/\/activity$/);
  await wait(j1);
  await j1.screenshot({ path: path.join(OUT_DIR, 'activity.png'), fullPage: false });

  // leaderboard.png
  await j1.goto(teamUrl);
  await j1.getByRole('link', { name: 'Leaderboard' }).click();
  await j1.waitForURL(/\/leaderboard$/);
  await wait(j1);
  await j1.screenshot({ path: path.join(OUT_DIR, 'leaderboard.png'), fullPage: false });

  // profile.png
  await j1.goto(teamUrl);
  await j1.getByRole('link', { name: 'My profile' }).click();
  await j1.waitForURL(/\/me$/);
  await wait(j1);
  await j1.screenshot({ path: path.join(OUT_DIR, 'profile.png'), fullPage: false });

  // landing.png (signed out)
  const guestCtx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    colorScheme: 'dark',
  });
  const guest = await guestCtx.newPage();
  await guest.goto('/');
  await wait(guest);
  await guest.screenshot({ path: path.join(OUT_DIR, 'landing.png'), fullPage: false });

  // light-mode.png — same dashboard, light mode
  await j1.emulateMedia({ colorScheme: 'light' });
  await j1.goto(teamUrl);
  await wait(j1);
  await j1.screenshot({ path: path.join(OUT_DIR, 'light-mode.png'), fullPage: false });

  await founderCtx.close();
  await j1Ctx.close();
  await j2Ctx.close();
  await guestCtx.close();
});
