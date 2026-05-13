import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import {
  getBalance,
  getSpendableAllowance,
  getSpendableAllowanceForWeek,
  grantInitialAllowance,
  WEEKLY_ALLOWANCE,
} from '@/server/ledger';
import { users, teams, ledgerEntries, bets, markets } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';

describe('ledger', () => {
  let handle: TestDbHandle;
  const userId = 'u1';
  const teamId = 't1';

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
    await handle.db.insert(users).values({ id: userId, email: 'u1@example.com' });
    await handle.db.insert(teams).values({ id: teamId, name: 'T', inviteCode: 'inv1' });
  });

  describe('getBalance', () => {
    it('returns 0 when no entries exist', async () => {
      const balance = await getBalance(handle.db, { userId, teamId });
      expect(balance).toBe(0);
    });

    it('sums all ledger entries for that user+team', async () => {
      await handle.db.insert(ledgerEntries).values([
        { userId, teamId, kind: 'allowance_grant', amount: 12 },
        { userId, teamId, kind: 'stake', amount: -5 },
        { userId, teamId, kind: 'payout', amount: 8 },
      ]);
      const balance = await getBalance(handle.db, { userId, teamId });
      expect(balance).toBe(15);
    });

    it('does not bleed across teams', async () => {
      const otherTeamId = 't2';
      await handle.db
        .insert(teams)
        .values({ id: otherTeamId, name: 'Other', inviteCode: 'inv2' });
      await handle.db.insert(ledgerEntries).values([
        { userId, teamId, kind: 'allowance_grant', amount: 12 },
        { userId, teamId: otherTeamId, kind: 'allowance_grant', amount: 12 },
      ]);
      expect(await getBalance(handle.db, { userId, teamId })).toBe(12);
      expect(await getBalance(handle.db, { userId, teamId: otherTeamId })).toBe(12);
    });
  });

  describe('getSpendableAllowance', () => {
    it('returns the grant amount when nothing has been bet this week', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
      await handle.db.insert(ledgerEntries).values({
        userId,
        teamId,
        kind: 'allowance_grant',
        amount: 12,
        createdAt: new Date('2026-05-11T00:00:00Z'),
      });
      const allowance = await getSpendableAllowance(handle.db, { userId, teamId });
      expect(allowance).toBe(12);
    });

    it('subtracts this-week stakes from this-week grants', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
      await handle.db.insert(ledgerEntries).values([
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-11T00:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'stake',
          amount: -5,
          createdAt: new Date('2026-05-12T10:00:00Z'),
        },
      ]);
      expect(await getSpendableAllowance(handle.db, { userId, teamId })).toBe(7);
    });

    it('clamps to 0 if more was bet than granted', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
      await handle.db.insert(ledgerEntries).values([
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-11T00:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'stake',
          amount: -20,
          createdAt: new Date('2026-05-12T10:00:00Z'),
        },
      ]);
      expect(await getSpendableAllowance(handle.db, { userId, teamId })).toBe(0);
    });

    it('ignores stakes from previous weeks', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
      await handle.db.insert(ledgerEntries).values([
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-11T00:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'stake',
          amount: -8,
          createdAt: new Date('2026-05-08T12:00:00Z'),
        },
      ]);
      expect(await getSpendableAllowance(handle.db, { userId, teamId })).toBe(12);
    });

    it('adds back refund-of-this-week-stake (restoring allowance)', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
      await handle.db.insert(users).values({ id: 'creator', email: 'c@example.com' });
      await handle.db.insert(markets).values({
        id: 'm1',
        teamId,
        creatorId: 'creator',
        title: 'voided',
        description: null,
        lockupAt: new Date('2026-05-20T00:00:00Z'),
        resolvesAt: new Date('2026-05-21T00:00:00Z'),
        status: 'voided',
      });
      await handle.db.insert(bets).values({
        id: 'b1',
        marketId: 'm1',
        userId,
        side: 'yes',
        amount: 5,
        placedAt: new Date('2026-05-12T10:00:00Z'),
      });
      await handle.db.insert(ledgerEntries).values([
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-11T00:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'stake',
          amount: -5,
          marketId: 'm1',
          betId: 'b1',
          createdAt: new Date('2026-05-12T10:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'refund',
          amount: 5,
          marketId: 'm1',
          betId: 'b1',
          createdAt: new Date('2026-05-13T11:00:00Z'),
        },
      ]);
      expect(await getSpendableAllowance(handle.db, { userId, teamId })).toBe(12);
    });

    it('does NOT add back refund-of-prior-week-stake (refund goes to holdings)', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
      await handle.db.insert(users).values({ id: 'creator', email: 'c@example.com' });
      await handle.db.insert(markets).values({
        id: 'm1',
        teamId,
        creatorId: 'creator',
        title: 'voided',
        description: null,
        lockupAt: new Date('2026-05-20T00:00:00Z'),
        resolvesAt: new Date('2026-05-21T00:00:00Z'),
        status: 'voided',
      });
      await handle.db.insert(bets).values({
        id: 'b1',
        marketId: 'm1',
        userId,
        side: 'yes',
        amount: 5,
        placedAt: new Date('2026-05-05T10:00:00Z'),
      });
      await handle.db.insert(ledgerEntries).values([
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-11T00:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'refund',
          amount: 5,
          marketId: 'm1',
          betId: 'b1',
          createdAt: new Date('2026-05-13T11:00:00Z'),
        },
      ]);
      expect(await getSpendableAllowance(handle.db, { userId, teamId })).toBe(12);
    });

    it('getSpendableAllowanceForWeek computes allowance for a specified prior week', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
      const lastWeekStart = new Date('2026-05-04T00:00:00Z');
      await handle.db.insert(ledgerEntries).values([
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-04T00:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'stake',
          amount: -3,
          createdAt: new Date('2026-05-06T10:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-11T00:00:00Z'),
        },
      ]);
      const lastWeek = await getSpendableAllowanceForWeek(handle.db, {
        userId,
        teamId,
        weekStart: lastWeekStart,
      });
      expect(lastWeek).toBe(9);
    });
  });

  describe('grantInitialAllowance', () => {
    it('writes a single allowance_grant for WEEKLY_ALLOWANCE doughnuts', async () => {
      await grantInitialAllowance(handle.db, { userId, teamId });
      const rows = await handle.db.select().from(ledgerEntries);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId,
        teamId,
        kind: 'allowance_grant',
        amount: WEEKLY_ALLOWANCE,
      });
    });

    it('is callable multiple times — it does NOT dedupe (caller responsibility)', async () => {
      await grantInitialAllowance(handle.db, { userId, teamId });
      await grantInitialAllowance(handle.db, { userId, teamId });
      const rows = await handle.db.select().from(ledgerEntries);
      expect(rows).toHaveLength(2);
    });
  });
});
