import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../../helpers/db';
import { users, teams, memberships, priceContests } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';
import { __setPriceProviderForTests } from '@/server/prices/provider';
import { FakePriceProvider } from '@/server/prices/fake';
import { getBalance } from '@/server/ledger';
import {
  upsertTeamContestConfig,
  createDailyContests,
  submitGuess,
  getCurrentContest,
  resolveDueContests,
  mintPrizesAndResolve,
} from '@/server/contests/contests';

describe('contests lifecycle', () => {
  let handle: TestDbHandle;
  let fake: FakePriceProvider;

  const MORNING = new Date('2026-08-19T13:00:00Z'); // ~9am ET, before submissions close
  const EVENING = new Date('2026-08-19T21:00:00Z'); // ~5pm ET, after resolvesAfter (16:15 ET)

  beforeAll(async () => {
    handle = await startTestDb();
  });

  afterAll(async () => {
    await handle.close();
    __setNowForTests(null);
    __setPriceProviderForTests(null);
  });

  beforeEach(async () => {
    await handle.truncateAll();
    __setNowForTests(null);
    fake = new FakePriceProvider();
    __setPriceProviderForTests(fake);

    await handle.db.insert(users).values([
      { id: 'a', email: 'a@example.com' },
      { id: 'b', email: 'b@example.com' },
      { id: 'c', email: 'c@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    // Seed membership directly — no allowance grant — so post-resolution balances equal prizes exactly.
    await handle.db.insert(memberships).values([
      { userId: 'a', teamId: 't1' },
      { userId: 'b', teamId: 't1' },
      { userId: 'c', teamId: 't1' },
    ]);

    fake.setTradingDay('2026-08-19');
    await upsertTeamContestConfig(handle.db, 't1', { enabled: true, symbols: ['AAPL'] });
  });

  it('runs the full loop: create, guess, resolve, mint prizes', async () => {
    __setNowForTests(MORNING);
    const created = await createDailyContests(handle.db, fake);
    expect(created).toHaveLength(1);
    const contestId = created[0];

    await submitGuess(handle.db, { contestId, userId: 'a', guessCents: 31722 });
    await submitGuess(handle.db, { contestId, userId: 'b', guessCents: 31736 });
    await submitGuess(handle.db, { contestId, userId: 'c', guessCents: 31620 });

    __setNowForTests(EVENING);
    fake.setClose('AAPL', '2026-08-19', 31683);
    await resolveDueContests(handle.db, fake);

    // Closest: a (diff 39) -> 25, b (diff 53) -> 15, c (diff 63) -> 10.
    expect(await getBalance(handle.db, { userId: 'a', teamId: 't1' })).toBe(25);
    expect(await getBalance(handle.db, { userId: 'b', teamId: 't1' })).toBe(15);
    expect(await getBalance(handle.db, { userId: 'c', teamId: 't1' })).toBe(10);

    expect(await getCurrentContest(handle.db, 't1', 'a')).toBeNull();
  });

  it('is idempotent: no duplicate contest, no double mint', async () => {
    __setNowForTests(MORNING);
    const firstCreated = await createDailyContests(handle.db, fake);
    expect(firstCreated).toHaveLength(1);
    const contestId = firstCreated[0];

    const secondCreated = await createDailyContests(handle.db, fake);
    expect(secondCreated).toHaveLength(0);
    const allContests = await handle.db.select().from(priceContests);
    expect(allContests).toHaveLength(1);

    await submitGuess(handle.db, { contestId, userId: 'a', guessCents: 31722 });
    await submitGuess(handle.db, { contestId, userId: 'b', guessCents: 31736 });
    await submitGuess(handle.db, { contestId, userId: 'c', guessCents: 31620 });

    __setNowForTests(EVENING);
    fake.setClose('AAPL', '2026-08-19', 31683);
    // First resolve mints prizes. Second is a no-op via the outer status='open' filter.
    await resolveDueContests(handle.db, fake);
    await resolveDueContests(handle.db, fake);

    expect(await getBalance(handle.db, { userId: 'a', teamId: 't1' })).toBe(25);
    expect(await getBalance(handle.db, { userId: 'b', teamId: 't1' })).toBe(15);
    expect(await getBalance(handle.db, { userId: 'c', teamId: 't1' })).toBe(10);

    // Directly re-invoke mintPrizesAndResolve on the already-resolved contest to
    // exercise its FOR UPDATE + status re-check guard (the double-mint guard proper).
    await mintPrizesAndResolve(handle.db, contestId, 31683, 'api', null);
    expect(await getBalance(handle.db, { userId: 'a', teamId: 't1' })).toBe(25);
    expect(await getBalance(handle.db, { userId: 'b', teamId: 't1' })).toBe(15);
    expect(await getBalance(handle.db, { userId: 'c', teamId: 't1' })).toBe(10);
  });
});
