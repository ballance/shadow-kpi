import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../../helpers/db';
import { upsertInstall, markUninstalled } from '@/server/slack/install';
import { decryptBotToken } from '@/server/slack/crypto';
import { slackInstalls, users } from '@/server/db/schema';

const TEST_KEY = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=';

describe('install', () => {
  let handle: TestDbHandle;
  beforeAll(async () => { handle = await startTestDb(); });
  afterAll(async () => { await handle.close(); });
  beforeEach(async () => {
    await handle.truncateAll();
    await handle.db.insert(users).values({ id: 'admin', email: 'a@x.com' });
  });

  it('upserts a new install row', async () => {
    await upsertInstall(handle.db, {
      workspaceId: 'T1',
      workspaceName: 'Acme',
      accessToken: 'xoxb-abc',
      botUserId: 'Ubot',
      installerUserId: 'admin',
      tokenEncKey: TEST_KEY,
    });
    const [row] = await handle.db.select().from(slackInstalls);
    expect(row.workspaceId).toBe('T1');
    expect(
      decryptBotToken(
        { ciphertext: row.botTokenCiphertext, iv: row.botTokenIv },
        TEST_KEY,
      ),
    ).toBe('xoxb-abc');
  });

  it('reinstall overwrites token and clears revokedAt', async () => {
    await upsertInstall(handle.db, {
      workspaceId: 'T1', workspaceName: 'Acme', accessToken: 'xoxb-old',
      botUserId: 'Ubot', installerUserId: 'admin', tokenEncKey: TEST_KEY,
    });
    await markUninstalled(handle.db, 'T1');
    await upsertInstall(handle.db, {
      workspaceId: 'T1', workspaceName: 'Acme', accessToken: 'xoxb-new',
      botUserId: 'Ubot', installerUserId: 'admin', tokenEncKey: TEST_KEY,
    });
    const [row] = await handle.db.select().from(slackInstalls);
    expect(
      decryptBotToken(
        { ciphertext: row.botTokenCiphertext, iv: row.botTokenIv },
        TEST_KEY,
      ),
    ).toBe('xoxb-new');
    expect(row.revokedAt).toBeNull();
  });
});
