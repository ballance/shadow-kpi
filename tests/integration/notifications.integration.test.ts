import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { createEventBus } from '@/server/events';
import { inAppNotificationSubscriber } from '@/server/notifications';
import {
  users,
  teams,
  memberships,
  markets,
  bets,
  notifications,
} from '@/server/db/schema';

describe('inAppNotificationSubscriber', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await startTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await handle.truncateAll();
    await handle.db.insert(users).values([
      { id: 'creator', email: 'c@example.com' },
      { id: 'a', email: 'a@example.com' },
      { id: 'b', email: 'b@example.com' },
      { id: 'outsider', email: 'o@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'creator', teamId: 't1' },
      { userId: 'a', teamId: 't1' },
      { userId: 'b', teamId: 't1' },
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
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'a', side: 'yes', amount: 5 },
      { id: 'b2', marketId: 'm1', userId: 'b', side: 'no', amount: 5 },
    ]);
  });

  it('MarketCreated → notifies all team members except creator', async () => {
    const bus = createEventBus();
    bus.subscribe((e) => inAppNotificationSubscriber(handle.db, e));
    await bus.emit({
      type: 'MarketCreated',
      marketId: 'm1',
      teamId: 't1',
      creatorId: 'creator',
    });

    const notifs = await handle.db.select().from(notifications);
    expect(notifs).toHaveLength(2);
    const userIds = notifs.map((n) => n.userId).sort();
    expect(userIds).toEqual(['a', 'b']);
    for (const n of notifs) {
      expect(n.kind).toBe('market_created');
      expect(n.marketId).toBe('m1');
    }
  });

  it('MarketLocked → notifies bettors only', async () => {
    const bus = createEventBus();
    bus.subscribe((e) => inAppNotificationSubscriber(handle.db, e));
    await bus.emit({ type: 'MarketLocked', marketId: 'm1', teamId: 't1' });

    const notifs = await handle.db.select().from(notifications);
    expect(notifs).toHaveLength(2);
    const userIds = notifs.map((n) => n.userId).sort();
    expect(userIds).toEqual(['a', 'b']);
    for (const n of notifs) expect(n.kind).toBe('market_locked');
  });

  it('MarketResolved → notifies bettors only with outcome in payload', async () => {
    const bus = createEventBus();
    bus.subscribe((e) => inAppNotificationSubscriber(handle.db, e));
    await bus.emit({
      type: 'MarketResolved',
      marketId: 'm1',
      teamId: 't1',
      outcome: 'yes',
    });

    const notifs = await handle.db.select().from(notifications);
    expect(notifs).toHaveLength(2);
    for (const n of notifs) {
      expect(n.kind).toBe('market_resolved');
      expect(n.payload).toBe(JSON.stringify({ outcome: 'yes' }));
    }
  });

  it('MarketVoided → notifies bettors only', async () => {
    const bus = createEventBus();
    bus.subscribe((e) => inAppNotificationSubscriber(handle.db, e));
    await bus.emit({ type: 'MarketVoided', marketId: 'm1', teamId: 't1' });

    const notifs = await handle.db.select().from(notifications);
    expect(notifs).toHaveLength(2);
    for (const n of notifs) expect(n.kind).toBe('market_voided');
  });

  it('CommentPosted → notifies bettors + creator, excluding commenter', async () => {
    const bus = createEventBus();
    bus.subscribe((e) => inAppNotificationSubscriber(handle.db, e));
    await bus.emit({
      type: 'CommentPosted',
      marketId: 'm1',
      teamId: 't1',
      commenterId: 'a',
    });

    const notifs = await handle.db.select().from(notifications);
    expect(notifs).toHaveLength(2);
    const userIds = notifs.map((n) => n.userId).sort();
    expect(userIds).toEqual(['b', 'creator']);
    for (const n of notifs) expect(n.kind).toBe('comment_posted');
  });
});
