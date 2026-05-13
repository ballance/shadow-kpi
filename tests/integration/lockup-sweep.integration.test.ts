import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { lockExpiredMarkets } from '@/server/markets';
import { users, teams, memberships, markets } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';

describe('markets.lockExpiredMarkets', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await startTestDb();
  });

  afterAll(async () => {
    await handle.close();
    __setNowForTests(null);
  });

  beforeEach(async () => {
    await handle.truncateAll();
    __setNowForTests(null);
    await handle.db.insert(users).values({ id: 'u1', email: 'u1@example.com' });
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values({ userId: 'u1', teamId: 't1' });
  });

  it('flips expired open markets to locked', async () => {
    __setNowForTests(new Date('2026-05-12T13:00:00Z'));
    await handle.db.insert(markets).values([
      {
        id: 'expired',
        teamId: 't1',
        creatorId: 'u1',
        title: 'Past lockup',
        description: null,
        lockupAt: new Date('2026-05-12T12:00:00Z'),
        resolvesAt: new Date('2026-05-12T13:00:00Z'),
        status: 'open',
      },
      {
        id: 'future',
        teamId: 't1',
        creatorId: 'u1',
        title: 'Future lockup',
        description: null,
        lockupAt: new Date('2026-05-13T00:00:00Z'),
        resolvesAt: new Date('2026-05-13T01:00:00Z'),
        status: 'open',
      },
    ]);
    const result = await lockExpiredMarkets(handle.db);
    expect(result.lockedIds).toEqual(['expired']);

    const rows = await handle.db.select().from(markets);
    expect(rows.find((r) => r.id === 'expired')?.status).toBe('locked');
    expect(rows.find((r) => r.id === 'future')?.status).toBe('open');
  });

  it('is idempotent — running twice on the same expired market locks once', async () => {
    __setNowForTests(new Date('2026-05-12T13:00:00Z'));
    await handle.db.insert(markets).values({
      id: 'expired',
      teamId: 't1',
      creatorId: 'u1',
      title: 'Past lockup',
      description: null,
      lockupAt: new Date('2026-05-12T12:00:00Z'),
      resolvesAt: new Date('2026-05-12T13:00:00Z'),
      status: 'open',
    });
    const first = await lockExpiredMarkets(handle.db);
    const second = await lockExpiredMarkets(handle.db);
    expect(first.lockedIds).toEqual(['expired']);
    expect(second.lockedIds).toEqual([]);
  });

  it('ignores resolved and voided markets', async () => {
    __setNowForTests(new Date('2026-05-12T13:00:00Z'));
    await handle.db.insert(markets).values([
      {
        id: 'resolved',
        teamId: 't1',
        creatorId: 'u1',
        title: 'Done',
        description: null,
        lockupAt: new Date('2026-05-12T10:00:00Z'),
        resolvesAt: new Date('2026-05-12T11:00:00Z'),
        status: 'resolved',
        outcome: 'yes',
      },
    ]);
    const result = await lockExpiredMarkets(handle.db);
    expect(result.lockedIds).toEqual([]);
  });
});
