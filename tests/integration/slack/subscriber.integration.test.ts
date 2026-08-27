import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../../helpers/db';
import { slackOutboxSubscriber } from '@/server/slack/events-subscriber';
import {
  users, teams, memberships, markets, bets,
  slackInstalls, slackTeamChannels, slackUserLinks, slackOutbox,
} from '@/server/db/schema';

const baseUrl = 'https://opbets.bastionforge.com';

async function seedTeamWithInstall(handle: TestDbHandle) {
  await handle.db.insert(users).values([
    { id: 'u-creator', email: 'c@x.com', name: 'Alice' },
    { id: 'u-bettor', email: 'b@x.com', name: 'Bob' },
    { id: 'u-other', email: 'o@x.com', name: 'Olive' },
  ]);
  await handle.db.insert(teams).values({ id: 't1', name: 'Eng', inviteCode: 'inv1' });
  await handle.db.insert(memberships).values([
    { userId: 'u-creator', teamId: 't1' },
    { userId: 'u-bettor', teamId: 't1' },
    { userId: 'u-other', teamId: 't1' },
  ]);
  await handle.db.insert(markets).values({
    id: 'm1', teamId: 't1', creatorId: 'u-creator',
    title: 'X', description: null,
    lockupAt: new Date('2026-05-25T00:00:00Z'),
    resolvesAt: new Date('2026-05-26T00:00:00Z'),
    status: 'open',
  });
  await handle.db.insert(slackInstalls).values({
    workspaceId: 'T1', workspaceName: 'WS',
    botTokenCiphertext: 'x', botTokenIv: 'x', botUserId: 'Ubot',
  });
  await handle.db.insert(slackTeamChannels).values({
    teamId: 't1', workspaceId: 'T1', channelId: 'C1', channelName: 'general',
  });
  await handle.db.insert(slackUserLinks).values({
    userId: 'u-bettor', workspaceId: 'T1', slackUserId: 'U-bettor',
  });
}

describe('slackOutboxSubscriber', () => {
  let handle: TestDbHandle;
  beforeAll(async () => { handle = await startTestDb(); });
  afterAll(async () => { await handle.close(); });
  beforeEach(async () => { await handle.truncateAll(); });

  it('MarketCreated → channel row only', async () => {
    await seedTeamWithInstall(handle);
    await slackOutboxSubscriber(handle.db, { baseUrl })({
      type: 'MarketCreated', marketId: 'm1', teamId: 't1', creatorId: 'u-creator',
    });
    const rows = await handle.db.select().from(slackOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0].targetKind).toBe('channel');
    expect(rows[0].dedupKey).toBe('MarketCreated:m1:channel');
  });

  it('MarketLocked → channel + one DM per linked bettor', async () => {
    await seedTeamWithInstall(handle);
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'u-bettor', side: 'yes', amount: 8, placedAt: new Date() },
      { id: 'b2', marketId: 'm1', userId: 'u-other', side: 'no', amount: 5, placedAt: new Date() },
    ]);
    await slackOutboxSubscriber(handle.db, { baseUrl })({
      type: 'MarketLocked', marketId: 'm1', teamId: 't1',
    });
    const rows = await handle.db.select().from(slackOutbox);
    expect(rows.find((r) => r.targetKind === 'channel')).toBeDefined();
    const dms = rows.filter((r) => r.targetKind === 'dm');
    expect(dms).toHaveLength(1);
    expect(dms[0].targetId).toBe('U-bettor');
  });

  it('skips channel writes when team has no channel mapping', async () => {
    await handle.db.insert(users).values({ id: 'u', email: 'u@x.com' });
    await handle.db.insert(teams).values({ id: 't1', name: 'Eng', inviteCode: 'i' });
    await handle.db.insert(memberships).values({ userId: 'u', teamId: 't1' });
    await handle.db.insert(markets).values({
      id: 'm1', teamId: 't1', creatorId: 'u', title: 'X', description: null,
      lockupAt: new Date('2026-05-25T00:00:00Z'),
      resolvesAt: new Date('2026-05-26T00:00:00Z'),
      status: 'open',
    });
    await slackOutboxSubscriber(handle.db, { baseUrl })({
      type: 'MarketCreated', marketId: 'm1', teamId: 't1', creatorId: 'u',
    });
    const rows = await handle.db.select().from(slackOutbox);
    expect(rows).toHaveLength(0);
  });

  it('skips writes when the install is revoked', async () => {
    await seedTeamWithInstall(handle);
    await handle.db.update(slackInstalls).set({ revokedAt: new Date() });
    await slackOutboxSubscriber(handle.db, { baseUrl })({
      type: 'MarketCreated', marketId: 'm1', teamId: 't1', creatorId: 'u-creator',
    });
    const rows = await handle.db.select().from(slackOutbox);
    expect(rows).toHaveLength(0);
  });

  it('CommentPosted does not write (balanced default)', async () => {
    await seedTeamWithInstall(handle);
    await slackOutboxSubscriber(handle.db, { baseUrl })({
      type: 'CommentPosted', marketId: 'm1', teamId: 't1', commenterId: 'u-creator',
    });
    const rows = await handle.db.select().from(slackOutbox);
    expect(rows).toHaveLength(0);
  });
});
