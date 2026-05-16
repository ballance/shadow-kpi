import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { users, teams, memberships, markets, bets } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';
import { listLockingSoon, listOpenPositions } from '@/server/dashboard';

describe('dashboard.listLockingSoon', () => {
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
    __setNowForTests(new Date('2026-05-15T12:00:00Z'));
    await handle.db.insert(users).values([
      { id: 'u1', email: 'u1@example.com' },
      { id: 'u2', email: 'u2@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'u1', teamId: 't1' },
      { userId: 'u2', teamId: 't1' },
    ]);
  });

  it('returns open markets locking within the window, ASC by lockupAt', async () => {
    await handle.db.insert(markets).values([
      {
        id: 'm-soon', teamId: 't1', creatorId: 'u1',
        title: 'Soon', description: null,
        lockupAt: new Date('2026-05-15T14:00:00Z'),
        resolvesAt: new Date('2026-05-15T18:00:00Z'),
      },
      {
        id: 'm-later', teamId: 't1', creatorId: 'u1',
        title: 'Later', description: null,
        lockupAt: new Date('2026-05-17T14:00:00Z'),
        resolvesAt: new Date('2026-05-18T00:00:00Z'),
      },
    ]);

    const rows = await listLockingSoon(handle.db, { teamId: 't1', userId: 'u2' });
    expect(rows.map((r) => r.market.id)).toEqual(['m-soon', 'm-later']);
  });

  it('respects limit', async () => {
    await handle.db.insert(markets).values([
      { id: 'a', teamId: 't1', creatorId: 'u1', title: 'A', description: null,
        lockupAt: new Date('2026-05-15T14:00:00Z'),
        resolvesAt: new Date('2026-05-15T18:00:00Z') },
      { id: 'b', teamId: 't1', creatorId: 'u1', title: 'B', description: null,
        lockupAt: new Date('2026-05-15T15:00:00Z'),
        resolvesAt: new Date('2026-05-15T19:00:00Z') },
      { id: 'c', teamId: 't1', creatorId: 'u1', title: 'C', description: null,
        lockupAt: new Date('2026-05-15T16:00:00Z'),
        resolvesAt: new Date('2026-05-15T20:00:00Z') },
      { id: 'd', teamId: 't1', creatorId: 'u1', title: 'D', description: null,
        lockupAt: new Date('2026-05-15T17:00:00Z'),
        resolvesAt: new Date('2026-05-15T21:00:00Z') },
    ]);
    const rows = await listLockingSoon(handle.db, { teamId: 't1', userId: 'u2', limit: 3 });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.market.id)).toEqual(['a', 'b', 'c']);
  });

  it('excludes markets that already locked or resolved', async () => {
    await handle.db.insert(markets).values([
      { id: 'open', teamId: 't1', creatorId: 'u1', title: 'Open', description: null,
        lockupAt: new Date('2026-05-15T14:00:00Z'),
        resolvesAt: new Date('2026-05-15T18:00:00Z') },
      { id: 'locked', teamId: 't1', creatorId: 'u1', title: 'Locked', description: null,
        lockupAt: new Date('2026-05-15T14:00:00Z'),
        resolvesAt: new Date('2026-05-15T18:00:00Z'),
        status: 'locked' },
    ]);
    const rows = await listLockingSoon(handle.db, { teamId: 't1', userId: 'u2' });
    expect(rows.map((r) => r.market.id)).toEqual(['open']);
  });

  it('excludes markets beyond withinHours window', async () => {
    await handle.db.insert(markets).values([
      { id: 'in-window', teamId: 't1', creatorId: 'u1', title: 'In', description: null,
        lockupAt: new Date('2026-05-16T11:00:00Z'),
        resolvesAt: new Date('2026-05-17T00:00:00Z') },
      { id: 'past-window', teamId: 't1', creatorId: 'u1', title: 'Past', description: null,
        lockupAt: new Date('2026-05-25T11:00:00Z'),
        resolvesAt: new Date('2026-05-26T00:00:00Z') },
    ]);
    const rows = await listLockingSoon(handle.db, { teamId: 't1', userId: 'u2', withinHours: 168 });
    expect(rows.map((r) => r.market.id)).toEqual(['in-window']);
  });

  it('includes pools and the calling user stake when present', async () => {
    await handle.db.insert(markets).values({
      id: 'm1', teamId: 't1', creatorId: 'u1', title: 'M', description: null,
      lockupAt: new Date('2026-05-15T14:00:00Z'),
      resolvesAt: new Date('2026-05-15T18:00:00Z'),
    });
    await handle.db.insert(bets).values([
      { marketId: 'm1', userId: 'u1', side: 'yes', amount: 5 },
      { marketId: 'm1', userId: 'u2', side: 'no', amount: 3 },
      { marketId: 'm1', userId: 'u2', side: 'no', amount: 2 },
    ]);
    const rows = await listLockingSoon(handle.db, { teamId: 't1', userId: 'u2' });
    expect(rows[0].pools).toEqual({ yes: 5, no: 5 });
    expect(rows[0].yourStake).toEqual({ side: 'no', amount: 5 });
  });

  it('returns yourStake = null when caller has no bet on the market', async () => {
    await handle.db.insert(markets).values({
      id: 'm1', teamId: 't1', creatorId: 'u1', title: 'M', description: null,
      lockupAt: new Date('2026-05-15T14:00:00Z'),
      resolvesAt: new Date('2026-05-15T18:00:00Z'),
    });
    await handle.db.insert(bets).values({ marketId: 'm1', userId: 'u1', side: 'yes', amount: 5 });
    const rows = await listLockingSoon(handle.db, { teamId: 't1', userId: 'u2' });
    expect(rows[0].yourStake).toBeNull();
  });
});

describe('dashboard.listOpenPositions', () => {
  let handle: TestDbHandle;

  beforeAll(async () => { handle = await startTestDb(); });
  afterAll(async () => { await handle.close(); __setNowForTests(null); });

  beforeEach(async () => {
    await handle.truncateAll();
    __setNowForTests(new Date('2026-05-15T12:00:00Z'));
    await handle.db.insert(users).values([
      { id: 'u1', email: 'u1@example.com' },
      { id: 'u2', email: 'u2@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'u1', teamId: 't1' },
      { userId: 'u2', teamId: 't1' },
    ]);
  });

  it('returns only markets where the user has a bet and status is open or locked', async () => {
    await handle.db.insert(markets).values([
      { id: 'open-with-bet', teamId: 't1', creatorId: 'u1', title: 'A', description: null,
        lockupAt: new Date('2026-05-15T14:00:00Z'),
        resolvesAt: new Date('2026-05-15T18:00:00Z') },
      { id: 'locked-with-bet', teamId: 't1', creatorId: 'u1', title: 'B', description: null,
        lockupAt: new Date('2026-05-15T11:00:00Z'),
        resolvesAt: new Date('2026-05-15T18:00:00Z'),
        status: 'locked' },
      { id: 'resolved-with-bet', teamId: 't1', creatorId: 'u1', title: 'C', description: null,
        lockupAt: new Date('2026-05-15T11:00:00Z'),
        resolvesAt: new Date('2026-05-15T11:30:00Z'),
        status: 'resolved', outcome: 'yes',
        resolvedAt: new Date('2026-05-15T11:35:00Z') },
      { id: 'open-no-bet', teamId: 't1', creatorId: 'u1', title: 'D', description: null,
        lockupAt: new Date('2026-05-15T14:00:00Z'),
        resolvesAt: new Date('2026-05-15T18:00:00Z') },
    ]);
    await handle.db.insert(bets).values([
      { marketId: 'open-with-bet', userId: 'u2', side: 'yes', amount: 3 },
      { marketId: 'locked-with-bet', userId: 'u2', side: 'no', amount: 2 },
      { marketId: 'resolved-with-bet', userId: 'u2', side: 'yes', amount: 4 },
    ]);

    const rows = await listOpenPositions(handle.db, { teamId: 't1', userId: 'u2' });
    expect(rows.map((r) => r.market.id).sort()).toEqual(['locked-with-bet', 'open-with-bet']);
  });

  it('sorts by lockupAt ASC', async () => {
    await handle.db.insert(markets).values([
      { id: 'late', teamId: 't1', creatorId: 'u1', title: 'L', description: null,
        lockupAt: new Date('2026-05-15T16:00:00Z'),
        resolvesAt: new Date('2026-05-15T20:00:00Z') },
      { id: 'early', teamId: 't1', creatorId: 'u1', title: 'E', description: null,
        lockupAt: new Date('2026-05-15T13:00:00Z'),
        resolvesAt: new Date('2026-05-15T18:00:00Z') },
    ]);
    await handle.db.insert(bets).values([
      { marketId: 'late', userId: 'u2', side: 'yes', amount: 1 },
      { marketId: 'early', userId: 'u2', side: 'no', amount: 1 },
    ]);
    const rows = await listOpenPositions(handle.db, { teamId: 't1', userId: 'u2' });
    expect(rows.map((r) => r.market.id)).toEqual(['early', 'late']);
  });

  it('aggregates pools and the caller stake (latest side wins if multi-side hypothetical)', async () => {
    await handle.db.insert(markets).values({
      id: 'm1', teamId: 't1', creatorId: 'u1', title: 'M', description: null,
      lockupAt: new Date('2026-05-15T14:00:00Z'),
      resolvesAt: new Date('2026-05-15T18:00:00Z'),
    });
    await handle.db.insert(bets).values([
      { marketId: 'm1', userId: 'u2', side: 'yes', amount: 3 },
      { marketId: 'm1', userId: 'u2', side: 'yes', amount: 2 },
      { marketId: 'm1', userId: 'u1', side: 'no', amount: 4 },
    ]);
    const rows = await listOpenPositions(handle.db, { teamId: 't1', userId: 'u2' });
    expect(rows[0].pools).toEqual({ yes: 5, no: 4 });
    expect(rows[0].yourStake).toEqual({ side: 'yes', amount: 5 });
  });

  it('returns empty array when user has no open positions', async () => {
    await handle.db.insert(markets).values({
      id: 'm1', teamId: 't1', creatorId: 'u1', title: 'M', description: null,
      lockupAt: new Date('2026-05-15T14:00:00Z'),
      resolvesAt: new Date('2026-05-15T18:00:00Z'),
    });
    const rows = await listOpenPositions(handle.db, { teamId: 't1', userId: 'u2' });
    expect(rows).toEqual([]);
  });
});
