import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { createMarket, listMarketsForTeam, getMarketDetail } from '@/server/markets';
import { users, teams, memberships, markets, bets } from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { __setNowForTests } from '@/server/time';

describe('markets.createMarket', () => {
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

  it('inserts an open market when input is valid', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    const market = await createMarket(handle.db, {
      teamId: 't1',
      creatorId: 'u1',
      title: 'Will the deploy ship Friday?',
      description: 'EOD Pacific',
      lockupAt: new Date('2026-05-15T17:00:00Z'),
      resolvesAt: new Date('2026-05-16T00:00:00Z'),
    });
    expect(market.id).toBeDefined();
    expect(market.status).toBe('open');
    expect(market.outcome).toBeNull();
    const rows = await handle.db.select().from(markets);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Will the deploy ship Friday?');
  });

  it('rejects when title is empty', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      createMarket(handle.db, {
        teamId: 't1',
        creatorId: 'u1',
        title: '   ',
        description: null,
        lockupAt: new Date('2026-05-15T17:00:00Z'),
        resolvesAt: new Date('2026-05-16T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects when lockupAt is in the past', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      createMarket(handle.db, {
        teamId: 't1',
        creatorId: 'u1',
        title: 'Late market',
        description: null,
        lockupAt: new Date('2026-05-11T12:00:00Z'),
        resolvesAt: new Date('2026-05-16T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects when resolvesAt is before lockupAt', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      createMarket(handle.db, {
        teamId: 't1',
        creatorId: 'u1',
        title: 'Backwards',
        description: null,
        lockupAt: new Date('2026-05-16T00:00:00Z'),
        resolvesAt: new Date('2026-05-15T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects when creator is not a team member', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.insert(users).values({ id: 'outsider', email: 'out@example.com' });
    await expect(
      createMarket(handle.db, {
        teamId: 't1',
        creatorId: 'outsider',
        title: 'Sneaky',
        description: null,
        lockupAt: new Date('2026-05-15T00:00:00Z'),
        resolvesAt: new Date('2026-05-16T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_TEAM_MEMBER' });
  });
});

describe('markets.listMarketsForTeam', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await startTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await handle.truncateAll();
    await handle.db.insert(users).values({ id: 'u1', email: 'u1@example.com' });
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values({ userId: 'u1', teamId: 't1' });
  });

  async function makeMarket(
    id: string,
    status: 'open' | 'locked' | 'resolved' | 'voided',
    createdAt: Date,
  ) {
    await handle.db.insert(markets).values({
      id,
      teamId: 't1',
      creatorId: 'u1',
      title: `M-${id}`,
      description: null,
      lockupAt: new Date('2026-12-31T00:00:00Z'),
      resolvesAt: new Date('2026-12-31T01:00:00Z'),
      status,
      createdAt,
    });
  }

  it('returns markets for the team ordered by createdAt desc', async () => {
    await makeMarket('m1', 'open', new Date('2026-05-10T00:00:00Z'));
    await makeMarket('m2', 'open', new Date('2026-05-12T00:00:00Z'));
    await makeMarket('m3', 'open', new Date('2026-05-11T00:00:00Z'));
    const rows = await listMarketsForTeam(handle.db, 't1');
    expect(rows.map((r) => r.id)).toEqual(['m2', 'm3', 'm1']);
  });

  it('filters by status when provided', async () => {
    await makeMarket('m1', 'open', new Date('2026-05-10T00:00:00Z'));
    await makeMarket('m2', 'resolved', new Date('2026-05-11T00:00:00Z'));
    const openOnly = await listMarketsForTeam(handle.db, 't1', 'open');
    const resolvedOnly = await listMarketsForTeam(handle.db, 't1', 'resolved');
    expect(openOnly.map((r) => r.id)).toEqual(['m1']);
    expect(resolvedOnly.map((r) => r.id)).toEqual(['m2']);
  });

  it('returns empty array when team has no markets', async () => {
    const rows = await listMarketsForTeam(handle.db, 't1');
    expect(rows).toEqual([]);
  });
});

describe('markets.getMarketDetail', () => {
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
      { id: 'u1', email: 'u1@example.com' },
      { id: 'u2', email: 'u2@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'u1', teamId: 't1' },
      { userId: 'u2', teamId: 't1' },
    ]);
    await handle.db.insert(markets).values({
      id: 'm1',
      teamId: 't1',
      creatorId: 'u1',
      title: 'Test market',
      description: null,
      lockupAt: new Date('2026-12-31T00:00:00Z'),
      resolvesAt: new Date('2026-12-31T01:00:00Z'),
      status: 'open',
    });
  });

  it('returns the market with zero pool totals when no bets exist', async () => {
    const detail = await getMarketDetail(handle.db, 'm1');
    expect(detail?.market.id).toBe('m1');
    expect(detail?.pools).toEqual({ yes: 0, no: 0 });
    expect(detail?.bets).toEqual([]);
  });

  it('returns aggregated pools and the bet list', async () => {
    await handle.db.insert(bets).values([
      { marketId: 'm1', userId: 'u2', side: 'yes', amount: 5 },
      { marketId: 'm1', userId: 'u2', side: 'yes', amount: 3 },
      { marketId: 'm1', userId: 'u2', side: 'no', amount: 4 },
    ]);
    const detail = await getMarketDetail(handle.db, 'm1');
    expect(detail?.pools).toEqual({ yes: 8, no: 4 });
    expect(detail?.bets).toHaveLength(3);
  });

  it('returns null when market does not exist', async () => {
    const detail = await getMarketDetail(handle.db, 'nope');
    expect(detail).toBeNull();
  });
});
