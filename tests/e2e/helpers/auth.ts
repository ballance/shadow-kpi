import { type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAGIC_LINK_DIR = path.resolve('.testcontainers');

export async function signInAs(page: Page, email: string): Promise<void> {
  const file = path.join(MAGIC_LINK_DIR, `magic-link-${email.toLowerCase()}.txt`);
  await fs.rm(file, { force: true });

  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send me a magic link' }).click();
  // Next Auth v5 may redirect to either our custom page or the default verify-request route
  await page.waitForURL((url) =>
    url.pathname.includes('check-email') ||
    url.pathname.includes('verify-request'),
  );

  const url = await pollForLink(file);
  await page.goto(url);
}

async function pollForLink(file: string, timeoutMs = 5000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const url = await fs.readFile(file, 'utf8');
      if (url.length > 0) return url.trim();
    } catch {
      // not written yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Magic link file never appeared: ${file}`);
}
