import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { getProfile } from '@/server/profile';
import {
  users,
  teams,
  memberships,
  markets,
  bets,
} from '@/server/db/schema';

describe('profile.getProfile', () => {
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
      { id: 'me', email: 'me@example.com' },
      { id: 'creator', email: 'c@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'me', teamId: 't1' },
      { userId: 'creator', teamId: 't1' },
    ]);
  });

  async function makeMarket(
    id: string,
    status: 'open' | 'locked' | 'resolved' | 'voided',
    outcome: 'yes' | 'no' | null,
  ) {
    await handle.db.insert(markets).values({
      id,
      teamId: 't1',
      creatorId: 'creator',
      title: `M-${id}`,
      description: null,
      lockupAt: new Date('2026-12-31T00:00:00Z'),
      resolvesAt: new Date('2026-12-31T01:00:00Z'),
      status,
      outcome,
    });
  }

  it('returns empty bet history and 0/0 win rate when no bets', async () => {
    const profile = await getProfile(handle.db, { userId: 'me', teamId: 't1' });
    expect(profile.bets).toEqual([]);
    expect(profile.winCount).toBe(0);
    expect(profile.resolvedCount).toBe(0);
  });

  it('counts wins on resolved markets where bet.side == market.outcome', async () => {
    await makeMarket('m1', 'resolved', 'yes');
    await makeMarket('m2', 'resolved', 'no');
    await makeMarket('m3', 'open', null);
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'me', side: 'yes', amount: 5 },
      { id: 'b2', marketId: 'm2', userId: 'me', side: 'yes', amount: 5 },
      { id: 'b3', marketId: 'm3', userId: 'me', side: 'yes', amount: 5 },
    ]);
    const profile = await getProfile(handle.db, { userId: 'me', teamId: 't1' });
    expect(profile.bets).toHaveLength(3);
    expect(profile.winCount).toBe(1);
    expect(profile.resolvedCount).toBe(2);
  });

  it('ignores bets on voided markets in the win-rate counters', async () => {
    await makeMarket('m1', 'resolved', 'yes');
    await makeMarket('m2', 'voided', null);
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'me', side: 'yes', amount: 5 },
      { id: 'b2', marketId: 'm2', userId: 'me', side: 'yes', amount: 5 },
    ]);
    const profile = await getProfile(handle.db, { userId: 'me', teamId: 't1' });
    expect(profile.bets).toHaveLength(2);
    expect(profile.winCount).toBe(1);
    expect(profile.resolvedCount).toBe(1);
  });

  it('scopes to team — does not include bets in another team', async () => {
    await handle.db.insert(teams).values({ id: 't2', name: 'Other', inviteCode: 'inv2' });
    await handle.db.insert(memberships).values({ userId: 'me', teamId: 't2' });
    await handle.db.insert(markets).values({
      id: 'm-other',
      teamId: 't2',
      creatorId: 'creator',
      title: 'Other',
      description: null,
      lockupAt: new Date('2026-12-31T00:00:00Z'),
      resolvesAt: new Date('2026-12-31T01:00:00Z'),
      status: 'open',
    });
    await handle.db.insert(bets).values({
      id: 'b-other',
      marketId: 'm-other',
      userId: 'me',
      side: 'yes',
      amount: 1,
    });

    const profile = await getProfile(handle.db, { userId: 'me', teamId: 't1' });
    expect(profile.bets).toEqual([]);
  });
});
