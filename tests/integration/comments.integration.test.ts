import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { addComment, listCommentsForMarket } from '@/server/comments';
import { eventBus } from '@/server/events';
import { inAppNotificationSubscriber } from '@/server/notifications';
import {
  users,
  teams,
  memberships,
  markets,
  comments,
  notifications,
} from '@/server/db/schema';

describe('comments service', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await startTestDb();
    // Register the in-app subscriber against the testcontainer DB on the production bus
    // so addComment's emit() reaches THIS test's DB.
    eventBus.subscribe((event) => inAppNotificationSubscriber(handle.db, event));
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await handle.truncateAll();
    await handle.db.insert(users).values([
      { id: 'creator', email: 'c@example.com' },
      { id: 'a', email: 'a@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'creator', teamId: 't1' },
      { userId: 'a', teamId: 't1' },
    ]);
    await handle.db.insert(markets).values({
      id: 'm1',
      teamId: 't1',
      creatorId: 'creator',
      title: 'Test',
      description: null,
      lockupAt: new Date('2026-05-20T00:00:00Z'),
      resolvesAt: new Date('2026-05-21T00:00:00Z'),
      status: 'open',
    });
  });

  describe('addComment', () => {
    it('inserts a comment and returns the row', async () => {
      const c = await addComment(handle.db, {
        marketId: 'm1',
        userId: 'a',
        body: 'first',
      });
      expect(c.body).toBe('first');
      const rows = await handle.db.select().from(comments);
      expect(rows).toHaveLength(1);
    });

    it('rejects empty body', async () => {
      await expect(
        addComment(handle.db, { marketId: 'm1', userId: 'a', body: '  ' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('rejects body over 2000 chars', async () => {
      const big = 'x'.repeat(2001);
      await expect(
        addComment(handle.db, { marketId: 'm1', userId: 'a', body: big }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('rejects when user is not a team member', async () => {
      await handle.db.insert(users).values({ id: 'outsider', email: 'o@example.com' });
      await expect(
        addComment(handle.db, { marketId: 'm1', userId: 'outsider', body: 'hi' }),
      ).rejects.toMatchObject({ code: 'NOT_TEAM_MEMBER' });
    });

    it('emits CommentPosted (subscriber writes notification for creator)', async () => {
      await addComment(handle.db, { marketId: 'm1', userId: 'a', body: 'hi' });
      // Allow any deferred microtasks to flush
      await new Promise((r) => setImmediate(r));
      const notifs = await handle.db.select().from(notifications);
      expect(notifs).toHaveLength(1);
      expect(notifs[0]).toMatchObject({ userId: 'creator', kind: 'comment_posted' });
    });
  });

  describe('listCommentsForMarket', () => {
    it('returns comments ordered by createdAt asc (oldest first)', async () => {
      await handle.db.insert(comments).values([
        {
          id: 'c1',
          marketId: 'm1',
          userId: 'a',
          body: 'first',
          createdAt: new Date('2026-05-12T10:00:00Z'),
        },
        {
          id: 'c2',
          marketId: 'm1',
          userId: 'creator',
          body: 'second',
          createdAt: new Date('2026-05-12T11:00:00Z'),
        },
      ]);
      const rows = await listCommentsForMarket(handle.db, 'm1');
      expect(rows.map((r) => r.id)).toEqual(['c1', 'c2']);
    });
  });
});
