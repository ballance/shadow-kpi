import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../../helpers/db';
import { enqueueOutboxMessages } from '@/server/slack/outbox';
import { slackOutbox } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

describe('outbox enqueue', () => {
  let handle: TestDbHandle;
  beforeAll(async () => { handle = await startTestDb(); });
  afterAll(async () => { await handle.close(); });
  beforeEach(async () => { await handle.truncateAll(); });

  it('inserts one row per message', async () => {
    await enqueueOutboxMessages(handle.db, [
      {
        workspaceId: 'T1',
        targetKind: 'channel',
        targetId: 'C1',
        payload: { text: 'hi', blocks: [] },
        dedupKey: 'MarketCreated:m1:channel',
      },
      {
        workspaceId: 'T1',
        targetKind: 'dm',
        targetId: 'U1',
        payload: { text: 'hi', blocks: [] },
        dedupKey: 'MarketCreated:m1:dm:u1',
      },
    ]);
    const rows = await handle.db.select().from(slackOutbox);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
  });

  it('is idempotent on dedupKey conflict', async () => {
    const msg = {
      workspaceId: 'T1',
      targetKind: 'channel' as const,
      targetId: 'C1',
      payload: { text: 'hi', blocks: [] },
      dedupKey: 'MarketLocked:m1:channel',
    };
    await enqueueOutboxMessages(handle.db, [msg]);
    await enqueueOutboxMessages(handle.db, [msg]);
    const rows = await handle.db
      .select()
      .from(slackOutbox)
      .where(eq(slackOutbox.dedupKey, 'MarketLocked:m1:channel'));
    expect(rows).toHaveLength(1);
  });

  it('allows null dedupKey (e.g., ad-hoc confirmation messages)', async () => {
    await enqueueOutboxMessages(handle.db, [
      {
        workspaceId: 'T1',
        targetKind: 'channel',
        targetId: 'C1',
        payload: { text: 'hi', blocks: [] },
        dedupKey: null,
      },
      {
        workspaceId: 'T1',
        targetKind: 'channel',
        targetId: 'C1',
        payload: { text: 'hi2', blocks: [] },
        dedupKey: null,
      },
    ]);
    const rows = await handle.db.select().from(slackOutbox);
    expect(rows).toHaveLength(2);
  });
});
