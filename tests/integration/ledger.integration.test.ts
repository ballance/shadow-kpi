import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import {
  getBalance,
  getSpendableAllowance,
  grantInitialAllowance,
  WEEKLY_ALLOWANCE,
} from '@/server/ledger';
import { users, teams, ledgerEntries } from '@/server/db/schema';
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
