import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { slackInstalls, slackTeamChannels } from '@/server/db/schema';
import type { SlackApiClient } from './api';
import { decryptBotToken } from './crypto';

export async function listWorkspaceChannels(
  db: Db,
  workspaceId: string,
  api: SlackApiClient,
  tokenEncKey: string,
): Promise<Array<{ id: string; name: string }>> {
  const [install] = await db
    .select({ ct: slackInstalls.botTokenCiphertext, iv: slackInstalls.botTokenIv })
    .from(slackInstalls)
    .where(eq(slackInstalls.workspaceId, workspaceId))
    .limit(1);
  if (!install) return [];
  const token = decryptBotToken({ ciphertext: install.ct, iv: install.iv }, tokenEncKey);

  const out: Array<{ id: string; name: string }> = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const res = await api.conversationsList({ token, cursor });
    if (!res.ok) break;
    for (const c of res.channels) {
      if (!c.isPrivate) out.push({ id: c.id, name: c.name });
    }
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return out;
}

export async function setTeamChannel(
  db: Db,
  input: {
    teamId: string;
    workspaceId: string;
    channelId: string;
    channelName: string;
    configuredByUserId: string;
  },
): Promise<void> {
  const existing = await db
    .select({ id: slackTeamChannels.id })
    .from(slackTeamChannels)
    .where(eq(slackTeamChannels.teamId, input.teamId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(slackTeamChannels)
      .set({
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        channelName: input.channelName,
        configuredByUserId: input.configuredByUserId,
        configuredAt: new Date(),
      })
      .where(eq(slackTeamChannels.teamId, input.teamId));
    return;
  }
  await db.insert(slackTeamChannels).values(input);
}

export async function clearTeamChannel(db: Db, teamId: string): Promise<void> {
  await db.delete(slackTeamChannels).where(eq(slackTeamChannels.teamId, teamId));
}

export async function getTeamChannel(db: Db, teamId: string) {
  const [row] = await db
    .select()
    .from(slackTeamChannels)
    .where(eq(slackTeamChannels.teamId, teamId))
    .limit(1);
  return row ?? null;
}
