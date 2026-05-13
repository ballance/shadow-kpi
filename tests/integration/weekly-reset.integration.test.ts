import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { runWeeklyReset } from '@/server/weekly-reset';
import { users, teams, memberships, ledgerEntries } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';
import { getBalance, WEEKLY_ALLOWANCE } from '@/server/ledger';

describe('weekly-reset.runWeeklyReset', () => {
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
  });

  async function setupOneUserOneTeam() {
    await handle.db.insert(users).values({ id: 'u1', email: 'u1@example.com' });
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values({ userId: 'u1', teamId: 't1' });
  }

  it('grants WEEKLY_ALLOWANCE to every member of every team', async () => {
    __setNowForTests(new Date('2026-05-11T00:01:00Z'));
    await setupOneUserOneTeam();
    await handle.db.insert(users).values({ id: 'u2', email: 'u2@example.com' });
    await handle.db.insert(memberships).values({ userId: 'u2', teamId: 't1' });

    const result = await runWeeklyReset(handle.db);
    expect(result.resetsApplied).toBe(2);

    const grants = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'allowance_grant',
    );
    expect(grants).toHaveLength(2);
    for (const g of grants) expect(g.amount).toBe(WEEKLY_ALLOWANCE);
  });

  it('evaporates unspent allowance from the previous week', async () => {
    __setNowForTests(new Date('2026-05-11T00:01:00Z'));
    await setupOneUserOneTeam();
    await handle.db.insert(ledgerEntries).values({
      userId: 'u1',
      teamId: 't1',
      kind: 'allowance_grant',
      amount: 12,
      createdAt: new Date('2026-05-04T00:01:00Z'),
    });

    await runWeeklyReset(handle.db);

    const entries = await handle.db.select().from(ledgerEntries);
    const evaporates = entries.filter((e) => e.kind === 'allowance_evaporate');
    expect(evaporates).toHaveLength(1);
    expect(evaporates[0].amount).toBe(-12);

    const balance = await getBalance(handle.db, { userId: 'u1', teamId: 't1' });
    expect(balance).toBe(WEEKLY_ALLOWANCE);
  });

  it('does NOT evaporate prior holdings (winnings persist)', async () => {
    __setNowForTests(new Date('2026-05-11T00:01:00Z'));
    await setupOneUserOneTeam();
    await handle.db.insert(ledgerEntries).values([
      {
        userId: 'u1',
        teamId: 't1',
        kind: 'allowance_grant',
        amount: 12,
        createdAt: new Date('2026-05-04T00:01:00Z'),
      },
      {
        userId: 'u1',
        teamId: 't1',
        kind: 'stake',
        amount: -10,
        createdAt: new Date('2026-05-05T12:00:00Z'),
      },
      {
        userId: 'u1',
        teamId: 't1',
        kind: 'payout',
        amount: 25,
        createdAt: new Date('2026-05-06T12:00:00Z'),
      },
    ]);

    await runWeeklyReset(handle.db);

    const balance = await getBalance(handle.db, { userId: 'u1', teamId: 't1' });
    expect(balance).toBe(37);
  });

  it('is idempotent — running twice in the same week is a no-op', async () => {
    __setNowForTests(new Date('2026-05-11T00:01:00Z'));
    await setupOneUserOneTeam();
    await handle.db.insert(ledgerEntries).values({
      userId: 'u1',
      teamId: 't1',
      kind: 'allowance_grant',
      amount: 12,
      createdAt: new Date('2026-05-04T00:01:00Z'),
    });

    const first = await runWeeklyReset(handle.db);
    const second = await runWeeklyReset(handle.db);
    expect(first.resetsApplied).toBe(1);
    expect(second.resetsApplied).toBe(0);

    const grants = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'allowance_grant',
    );
    expect(grants).toHaveLength(2);
  });

  it('skips members whose initial grant lives in the current week (just-joined users)', async () => {
    __setNowForTests(new Date('2026-05-11T00:01:00Z'));
    await setupOneUserOneTeam();
    await handle.db.insert(ledgerEntries).values({
      userId: 'u1',
      teamId: 't1',
      kind: 'allowance_grant',
      amount: 12,
      createdAt: new Date('2026-05-11T00:00:30Z'),
    });

    const result = await runWeeklyReset(handle.db);
    expect(result.resetsApplied).toBe(0);

    const grants = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'allowance_grant',
    );
    expect(grants).toHaveLength(1);
  });
});
