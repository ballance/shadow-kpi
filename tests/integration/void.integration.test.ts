import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { voidMarket } from '@/server/markets';
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

describe('markets.voidMarket', () => {
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
      lockupAt: new Date('2026-05-20T00:00:00Z'),
      resolvesAt: new Date('2026-05-21T00:00:00Z'),
      status: 'open',
    });
  });

  it('rejects when caller is not the creator', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      voidMarket(handle.db, { marketId: 'm1', userId: 'a' }),
    ).rejects.toMatchObject({ code: 'NOT_MARKET_CREATOR' });
  });

  it('rejects when now is at or after lockupAt', async () => {
    __setNowForTests(new Date('2026-05-20T00:00:01Z'));
    await expect(
      voidMarket(handle.db, { marketId: 'm1', userId: 'creator' }),
    ).rejects.toMatchObject({ code: 'BET_AFTER_LOCKUP' });
  });

  it('rejects when market is already locked or resolved', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.update(markets).set({ status: 'locked' });
    await expect(
      voidMarket(handle.db, { marketId: 'm1', userId: 'creator' }),
    ).rejects.toMatchObject({ code: 'MARKET_NOT_RESOLVABLE' });
  });

  it('voids an open market with no bets — no refunds, status flips', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    const result = await voidMarket(handle.db, { marketId: 'm1', userId: 'creator' });
    expect(result.status).toBe('voided');
    const refunds = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'refund',
    );
    expect(refunds).toHaveLength(0);
  });

  it('refunds every stake when there are bets', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'a', side: 'yes', amount: 4 },
      { id: 'b2', marketId: 'm1', userId: 'b', side: 'no', amount: 7 },
    ]);
    await handle.db.insert(ledgerEntries).values([
      { userId: 'a', teamId: 't1', kind: 'stake', amount: -4, marketId: 'm1', betId: 'b1' },
      { userId: 'b', teamId: 't1', kind: 'stake', amount: -7, marketId: 'm1', betId: 'b2' },
    ]);

    await voidMarket(handle.db, { marketId: 'm1', userId: 'creator' });

    const refunds = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'refund',
    );
    expect(refunds).toHaveLength(2);

    const aBalance = await getBalance(handle.db, { userId: 'a', teamId: 't1' });
    const bBalance = await getBalance(handle.db, { userId: 'b', teamId: 't1' });
    expect(aBalance).toBe(WEEKLY_ALLOWANCE);
    expect(bBalance).toBe(WEEKLY_ALLOWANCE);
  });

  it('refund ledger entry references the correct bet and market', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.insert(bets).values({
      id: 'b1',
      marketId: 'm1',
      userId: 'a',
      side: 'yes',
      amount: 5,
    });
    await handle.db.insert(ledgerEntries).values({
      userId: 'a',
      teamId: 't1',
      kind: 'stake',
      amount: -5,
      marketId: 'm1',
      betId: 'b1',
    });

    await voidMarket(handle.db, { marketId: 'm1', userId: 'creator' });

    const refund = (await handle.db.select().from(ledgerEntries)).find(
      (e) => e.kind === 'refund',
    );
    expect(refund).toMatchObject({
      userId: 'a',
      teamId: 't1',
      amount: 5,
      marketId: 'm1',
      betId: 'b1',
    });
  });
});
