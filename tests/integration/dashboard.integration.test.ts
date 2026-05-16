import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { users, teams, memberships, markets, bets, ledgerEntries } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';
import { listLockingSoon, listOpenPositions, listResolvedSince, readAndAdvanceLastSeen } from '@/server/dashboard';
import { eq, and } from 'drizzle-orm';

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

describe('dashboard.listResolvedSince', () => {
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

  it('returns markets resolved after `since` where caller had a stake', async () => {
    await handle.db.insert(markets).values([
      { id: 'recent-won', teamId: 't1', creatorId: 'u1', title: 'Won', description: null,
        lockupAt: new Date('2026-05-15T10:00:00Z'),
        resolvesAt: new Date('2026-05-15T11:00:00Z'),
        status: 'resolved', outcome: 'yes',
        resolvedAt: new Date('2026-05-15T11:30:00Z') },
      { id: 'old-won', teamId: 't1', creatorId: 'u1', title: 'OldWon', description: null,
        lockupAt: new Date('2026-05-14T10:00:00Z'),
        resolvesAt: new Date('2026-05-14T11:00:00Z'),
        status: 'resolved', outcome: 'yes',
        resolvedAt: new Date('2026-05-14T11:30:00Z') },
    ]);
    await handle.db.insert(bets).values([
      { marketId: 'recent-won', userId: 'u2', side: 'yes', amount: 3 },
      { marketId: 'old-won', userId: 'u2', side: 'yes', amount: 3 },
    ]);
    await handle.db.insert(ledgerEntries).values([
      { teamId: 't1', userId: 'u2', amount: -3, kind: 'stake', marketId: 'recent-won' },
      { teamId: 't1', userId: 'u2', amount: 7, kind: 'payout', marketId: 'recent-won' },
      { teamId: 't1', userId: 'u2', amount: -3, kind: 'stake', marketId: 'old-won' },
      { teamId: 't1', userId: 'u2', amount: 7, kind: 'payout', marketId: 'old-won' },
    ]);

    const rows = await listResolvedSince(handle.db, {
      teamId: 't1', userId: 'u2',
      since: new Date('2026-05-15T00:00:00Z'),
    });
    expect(rows.map((r) => r.market.id)).toEqual(['recent-won']);
    expect(rows[0].yourDelta).toBe(4); // -3 + 7
  });

  it('returns markets the caller created even without a stake', async () => {
    await handle.db.insert(markets).values({
      id: 'mine', teamId: 't1', creatorId: 'u2', title: 'Mine', description: null,
      lockupAt: new Date('2026-05-15T10:00:00Z'),
      resolvesAt: new Date('2026-05-15T11:00:00Z'),
      status: 'resolved', outcome: 'no',
      resolvedAt: new Date('2026-05-15T11:30:00Z'),
    });
    const rows = await listResolvedSince(handle.db, {
      teamId: 't1', userId: 'u2',
      since: new Date('2026-05-15T00:00:00Z'),
    });
    expect(rows.map((r) => r.market.id)).toEqual(['mine']);
    expect(rows[0].yourDelta).toBe(0);
  });

  it('includes voided markets and reports delta of zero (stake + refund cancel)', async () => {
    await handle.db.insert(markets).values({
      id: 'voided', teamId: 't1', creatorId: 'u1', title: 'V', description: null,
      lockupAt: new Date('2026-05-15T10:00:00Z'),
      resolvesAt: new Date('2026-05-15T11:00:00Z'),
      status: 'voided', outcome: null,
      resolvedAt: new Date('2026-05-15T11:30:00Z'),
    });
    await handle.db.insert(bets).values({
      marketId: 'voided', userId: 'u2', side: 'yes', amount: 4,
    });
    await handle.db.insert(ledgerEntries).values([
      { teamId: 't1', userId: 'u2', amount: -4, kind: 'stake', marketId: 'voided' },
      { teamId: 't1', userId: 'u2', amount: 4, kind: 'refund', marketId: 'voided' },
    ]);
    const rows = await listResolvedSince(handle.db, {
      teamId: 't1', userId: 'u2',
      since: new Date('2026-05-15T00:00:00Z'),
    });
    expect(rows.map((r) => r.market.id)).toEqual(['voided']);
    expect(rows[0].yourDelta).toBe(0);
  });

  it('returns negative delta when caller lost', async () => {
    await handle.db.insert(markets).values({
      id: 'lost', teamId: 't1', creatorId: 'u1', title: 'L', description: null,
      lockupAt: new Date('2026-05-15T10:00:00Z'),
      resolvesAt: new Date('2026-05-15T11:00:00Z'),
      status: 'resolved', outcome: 'no',
      resolvedAt: new Date('2026-05-15T11:30:00Z'),
    });
    await handle.db.insert(bets).values({
      marketId: 'lost', userId: 'u2', side: 'yes', amount: 5,
    });
    await handle.db.insert(ledgerEntries).values({
      teamId: 't1', userId: 'u2', amount: -5, kind: 'stake', marketId: 'lost',
    });
    const rows = await listResolvedSince(handle.db, {
      teamId: 't1', userId: 'u2',
      since: new Date('2026-05-15T00:00:00Z'),
    });
    expect(rows[0].yourDelta).toBe(-5);
  });

  it('excludes resolved markets the caller had no stake in and did not create', async () => {
    await handle.db.insert(markets).values({
      id: 'other', teamId: 't1', creatorId: 'u1', title: 'O', description: null,
      lockupAt: new Date('2026-05-15T10:00:00Z'),
      resolvesAt: new Date('2026-05-15T11:00:00Z'),
      status: 'resolved', outcome: 'yes',
      resolvedAt: new Date('2026-05-15T11:30:00Z'),
    });
    const rows = await listResolvedSince(handle.db, {
      teamId: 't1', userId: 'u2',
      since: new Date('2026-05-15T00:00:00Z'),
    });
    expect(rows).toEqual([]);
  });
});

describe('dashboard.readAndAdvanceLastSeen', () => {
  let handle: TestDbHandle;

  beforeAll(async () => { handle = await startTestDb(); });
  afterAll(async () => { await handle.close(); __setNowForTests(null); });

  beforeEach(async () => {
    await handle.truncateAll();
    await handle.db.insert(users).values({ id: 'u1', email: 'u1@example.com' });
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values({ userId: 'u1', teamId: 't1' });
  });

  it('returns previous=null on first read and advances the cursor', async () => {
    __setNowForTests(new Date('2026-05-15T12:00:00Z'));
    const result = await readAndAdvanceLastSeen(handle.db, { userId: 'u1', teamId: 't1' });
    expect(result.previous).toBeNull();
    expect(result.advanced).toBe(true);

    const [row] = await handle.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, 'u1'), eq(memberships.teamId, 't1')));
    expect(row.lastSeenAt?.toISOString()).toBe('2026-05-15T12:00:00.000Z');
  });

  it('returns the previous value and advances when stale', async () => {
    __setNowForTests(new Date('2026-05-15T12:00:00Z'));
    await handle.db
      .update(memberships)
      .set({ lastSeenAt: new Date('2026-05-15T11:00:00Z') })
      .where(and(eq(memberships.userId, 'u1'), eq(memberships.teamId, 't1')));

    const result = await readAndAdvanceLastSeen(handle.db, { userId: 'u1', teamId: 't1' });
    expect(result.previous?.toISOString()).toBe('2026-05-15T11:00:00.000Z');
    expect(result.advanced).toBe(true);
  });

  it('does not advance when previous is fresh (<30min)', async () => {
    __setNowForTests(new Date('2026-05-15T12:00:00Z'));
    await handle.db
      .update(memberships)
      .set({ lastSeenAt: new Date('2026-05-15T11:45:00Z') })
      .where(and(eq(memberships.userId, 'u1'), eq(memberships.teamId, 't1')));

    const result = await readAndAdvanceLastSeen(handle.db, { userId: 'u1', teamId: 't1' });
    expect(result.previous?.toISOString()).toBe('2026-05-15T11:45:00.000Z');
    expect(result.advanced).toBe(false);

    const [row] = await handle.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, 'u1'), eq(memberships.teamId, 't1')));
    expect(row.lastSeenAt?.toISOString()).toBe('2026-05-15T11:45:00.000Z');
  });
});
