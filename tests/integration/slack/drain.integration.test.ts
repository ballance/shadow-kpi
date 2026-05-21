import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../../helpers/db';
import { drainOutbox, enqueueOutboxMessages } from '@/server/slack/outbox';
import { slackOutbox, slackInstalls } from '@/server/db/schema';
import { InMemorySlackApi } from '@/server/slack/api-inmemory';
import { encryptBotToken } from '@/server/slack/crypto';

const TEST_KEY = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=';

async function seedInstall(handle: TestDbHandle, workspaceId = 'T1') {
  const enc = encryptBotToken('xoxb-test', TEST_KEY);
  await handle.db.insert(slackInstalls).values({
    workspaceId,
    workspaceName: 'Test',
    botTokenCiphertext: enc.ciphertext,
    botTokenIv: enc.iv,
    botUserId: 'Ubot',
  });
}

describe('drainOutbox', () => {
  let handle: TestDbHandle;
  beforeAll(async () => { handle = await startTestDb(); });
  afterAll(async () => { await handle.close(); });
  beforeEach(async () => { await handle.truncateAll(); });

  it('sends a pending message and marks sent', async () => {
    await seedInstall(handle);
    await enqueueOutboxMessages(handle.db, [
      {
        workspaceId: 'T1',
        targetKind: 'channel',
        targetId: 'C1',
        payload: { text: 'hi', blocks: [] },
        dedupKey: null,
      },
    ]);
    const api = new InMemorySlackApi();
    const result = await drainOutbox(handle.db, {
      api,
      tokenEncKey: TEST_KEY,
      batchLimit: 50,
      wallClockBudgetMs: 5000,
      sendIntervalMs: 0,
    });
    expect(result.sent).toBe(1);
    expect(api.postMessageCalls).toHaveLength(1);
    expect(api.postMessageCalls[0].channel).toBe('C1');
    const rows = await handle.db.select().from(slackOutbox);
    expect(rows[0].status).toBe('sent');
  });

  it('honors 429 retry-after by re-deferring with attempts++', async () => {
    await seedInstall(handle);
    await enqueueOutboxMessages(handle.db, [
      {
        workspaceId: 'T1',
        targetKind: 'channel',
        targetId: 'C1',
        payload: { text: 'hi', blocks: [] },
        dedupKey: null,
      },
    ]);
    const api = new InMemorySlackApi();
    api.scriptedPostMessage.push({
      result: { ok: false, error: 'ratelimited', retryAfterSeconds: 3 },
    });
    const before = Date.now();
    await drainOutbox(handle.db, {
      api,
      tokenEncKey: TEST_KEY,
      batchLimit: 50,
      wallClockBudgetMs: 5000,
      sendIntervalMs: 0,
    });
    const [row] = await handle.db.select().from(slackOutbox);
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 2900);
  });

  it('marks failed_permanent on channel_not_found', async () => {
    await seedInstall(handle);
    await enqueueOutboxMessages(handle.db, [
      {
        workspaceId: 'T1',
        targetKind: 'channel',
        targetId: 'C-missing',
        payload: { text: 'hi', blocks: [] },
        dedupKey: null,
      },
    ]);
    const api = new InMemorySlackApi();
    api.scriptedPostMessage.push({
      result: { ok: false, error: 'channel_not_found' },
    });
    await drainOutbox(handle.db, {
      api,
      tokenEncKey: TEST_KEY,
      batchLimit: 50,
      wallClockBudgetMs: 5000,
      sendIntervalMs: 0,
    });
    const [row] = await handle.db.select().from(slackOutbox);
    expect(row.status).toBe('failed_permanent');
    expect(row.lastError).toBe('channel_not_found');
  });

  it('opens a DM via conversations.open before postMessage', async () => {
    await seedInstall(handle);
    await enqueueOutboxMessages(handle.db, [
      {
        workspaceId: 'T1',
        targetKind: 'dm',
        targetId: 'U-recipient',
        payload: { text: 'hi', blocks: [] },
        dedupKey: null,
      },
    ]);
    const api = new InMemorySlackApi();
    api.conversationsOpenResult = { ok: true, channelId: 'D-derived' };
    await drainOutbox(handle.db, {
      api,
      tokenEncKey: TEST_KEY,
      batchLimit: 50,
      wallClockBudgetMs: 5000,
      sendIntervalMs: 0,
    });
    expect(api.postMessageCalls[0].channel).toBe('D-derived');
  });
});
