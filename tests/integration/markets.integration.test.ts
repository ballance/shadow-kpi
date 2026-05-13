import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { createMarket } from '@/server/markets';
import { users, teams, memberships, markets } from '@/server/db/schema';
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
