import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { resolveMarket } from '@/server/markets';
import {
  users,
  teams,
  memberships,
  markets,
  bets,
  ledgerEntries,
} from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';
import { getBalance, WEEKLY_ALLOWANCE, grantInitialAllowance } from '@/server/ledger';

describe('markets.resolveMarket', () => {
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
    await handle.db.insert(users).values([
      { id: 'creator', email: 'creator@example.com' },
      { id: 'a', email: 'a@example.com' },
      { id: 'b', email: 'b@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'creator', teamId: 't1' },
      { userId: 'a', teamId: 't1' },
      { userId: 'b', teamId: 't1' },
    ]);
    await grantInitialAllowance(handle.db, { userId: 'a', teamId: 't1' });
    await grantInitialAllowance(handle.db, { userId: 'b', teamId: 't1' });
    await handle.db.insert(markets).values({
      id: 'm1',
      teamId: 't1',
      creatorId: 'creator',
      title: 'Test',
      description: null,
      lockupAt: new Date('2026-05-12T18:00:00Z'),
      resolvesAt: new Date('2026-05-12T19:00:00Z'),
      status: 'locked',
    });
  });

  it('rejects when caller is not the creator', async () => {
    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    await expect(
      resolveMarket(handle.db, { marketId: 'm1', userId: 'a', outcome: 'yes' }),
    ).rejects.toMatchObject({ code: 'NOT_MARKET_CREATOR' });
  });

  it('rejects when called before resolvesAt', async () => {
    __setNowForTests(new Date('2026-05-12T18:30:00Z'));
    await expect(
      resolveMarket(handle.db, { marketId: 'm1', userId: 'creator', outcome: 'yes' }),
    ).rejects.toMatchObject({ code: 'RESOLVE_TOO_EARLY' });
  });

  it('rejects when market is already resolved', async () => {
    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    await handle.db.update(markets).set({ status: 'resolved', outcome: 'yes' });
    await expect(
      resolveMarket(handle.db, { marketId: 'm1', userId: 'creator', outcome: 'yes' }),
    ).rejects.toMatchObject({ code: 'MARKET_NOT_RESOLVABLE' });
  });

  it('pays winners and updates market status (single winner takes losing pool)', async () => {
    __setNowForTests(new Date('2026-05-12T15:00:00Z'));
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'a', side: 'yes', amount: 5 },
      { id: 'b2', marketId: 'm1', userId: 'b', side: 'no', amount: 10 },
    ]);
    await handle.db.insert(ledgerEntries).values([
      { userId: 'a', teamId: 't1', kind: 'stake', amount: -5, marketId: 'm1', betId: 'b1' },
      { userId: 'b', teamId: 't1', kind: 'stake', amount: -10, marketId: 'm1', betId: 'b2' },
    ]);

    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    const resolved = await resolveMarket(handle.db, {
      marketId: 'm1',
      userId: 'creator',
      outcome: 'yes',
    });
    expect(resolved.status).toBe('resolved');
    expect(resolved.outcome).toBe('yes');
    expect(resolved.resolvedAt).toBeInstanceOf(Date);

    const aBalance = await getBalance(handle.db, { userId: 'a', teamId: 't1' });
    expect(aBalance).toBe(WEEKLY_ALLOWANCE - 5 + 15);

    const bBalance = await getBalance(handle.db, { userId: 'b', teamId: 't1' });
    expect(bBalance).toBe(WEEKLY_ALLOWANCE - 10);
  });

  it('vaporizes losing-side stakes when no winners bet', async () => {
    __setNowForTests(new Date('2026-05-12T15:00:00Z'));
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'a', side: 'no', amount: 4 },
      { id: 'b2', marketId: 'm1', userId: 'b', side: 'no', amount: 6 },
    ]);
    await handle.db.insert(ledgerEntries).values([
      { userId: 'a', teamId: 't1', kind: 'stake', amount: -4, marketId: 'm1', betId: 'b1' },
      { userId: 'b', teamId: 't1', kind: 'stake', amount: -6, marketId: 'm1', betId: 'b2' },
    ]);

    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    await resolveMarket(handle.db, {
      marketId: 'm1',
      userId: 'creator',
      outcome: 'yes',
    });

    const payouts = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'payout',
    );
    expect(payouts).toHaveLength(0);

    const aBalance = await getBalance(handle.db, { userId: 'a', teamId: 't1' });
    const bBalance = await getBalance(handle.db, { userId: 'b', teamId: 't1' });
    expect(aBalance).toBe(WEEKLY_ALLOWANCE - 4);
    expect(bBalance).toBe(WEEKLY_ALLOWANCE - 6);
  });

  it('one-sided pool (only winners bet) refunds stakes with no profit', async () => {
    __setNowForTests(new Date('2026-05-12T15:00:00Z'));
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'a', side: 'yes', amount: 7 },
    ]);
    await handle.db.insert(ledgerEntries).values([
      { userId: 'a', teamId: 't1', kind: 'stake', amount: -7, marketId: 'm1', betId: 'b1' },
    ]);

    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    await resolveMarket(handle.db, {
      marketId: 'm1',
      userId: 'creator',
      outcome: 'yes',
    });

    const aBalance = await getBalance(handle.db, { userId: 'a', teamId: 't1' });
    expect(aBalance).toBe(WEEKLY_ALLOWANCE);
  });

  it('resolves a market that has no bets without writing payouts', async () => {
    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    const resolved = await resolveMarket(handle.db, {
      marketId: 'm1',
      userId: 'creator',
      outcome: 'yes',
    });
    expect(resolved.status).toBe('resolved');
    const payouts = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'payout',
    );
    expect(payouts).toHaveLength(0);
  });
});
