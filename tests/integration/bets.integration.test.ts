import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { placeBet } from '@/server/bets';
import { users, teams, memberships, markets, bets, ledgerEntries } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';
import { grantInitialAllowance } from '@/server/ledger';

describe('bets.placeBet', () => {
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
      { id: 'bettor', email: 'bettor@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'creator', teamId: 't1' },
      { userId: 'bettor', teamId: 't1' },
    ]);
    await grantInitialAllowance(handle.db, { userId: 'bettor', teamId: 't1' });
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

  it('places a bet, writes a stake ledger entry, and returns the bet row', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    const placed = await placeBet(handle.db, {
      marketId: 'm1',
      userId: 'bettor',
      side: 'yes',
      amount: 5,
    });
    expect(placed.side).toBe('yes');
    expect(placed.amount).toBe(5);

    const allBets = await handle.db.select().from(bets);
    expect(allBets).toHaveLength(1);

    const stake = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'stake',
    );
    expect(stake).toHaveLength(1);
    expect(stake[0]).toMatchObject({
      userId: 'bettor',
      teamId: 't1',
      amount: -5,
      betId: placed.id,
    });
  });

  it('rejects with INSUFFICIENT_BALANCE when amount exceeds balance', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 99 }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    const allBets = await handle.db.select().from(bets);
    expect(allBets).toHaveLength(0);
  });

  it('rejects with CREATOR_CANNOT_BET when the bettor is the market creator', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await grantInitialAllowance(handle.db, { userId: 'creator', teamId: 't1' });
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'creator', side: 'yes', amount: 1 }),
    ).rejects.toMatchObject({ code: 'CREATOR_CANNOT_BET' });
  });

  it('rejects with BET_AFTER_LOCKUP when now is at or after lockupAt', async () => {
    __setNowForTests(new Date('2026-05-20T00:00:01Z'));
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 1 }),
    ).rejects.toMatchObject({ code: 'BET_AFTER_LOCKUP' });
  });

  it('rejects with AMOUNT_BELOW_MINIMUM when amount is 0 or negative', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 0 }),
    ).rejects.toMatchObject({ code: 'AMOUNT_BELOW_MINIMUM' });
  });

  it('rejects non-integer amounts', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 1.5 }),
    ).rejects.toMatchObject({ code: 'AMOUNT_BELOW_MINIMUM' });
  });

  it('rejects with NOT_TEAM_MEMBER when bettor is not in the team', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.insert(users).values({ id: 'outsider', email: 'o@example.com' });
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'outsider', side: 'yes', amount: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_TEAM_MEMBER' });
  });

  it('rejects with BET_AFTER_LOCKUP if market is already locked', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.update(markets).set({ status: 'locked' });
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 1 }),
    ).rejects.toMatchObject({ code: 'BET_AFTER_LOCKUP' });
  });

  it('serializes concurrent bets — two simultaneous bets cannot both overdraft', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    const results = await Promise.allSettled([
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 8 }),
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'no', amount: 8 }),
    ]);
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
    });
  });
});
