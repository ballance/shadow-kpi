import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { slackInstalls } from '@/server/db/schema';
import { encryptBotToken } from './crypto';

export interface UpsertInstallInput {
  workspaceId: string;
  workspaceName: string;
  accessToken: string;
  botUserId: string;
  installerUserId: string;
  tokenEncKey: string;
}

export async function upsertInstall(db: Db, input: UpsertInstallInput): Promise<void> {
  const enc = encryptBotToken(input.accessToken, input.tokenEncKey);
  const existing = await db
    .select({ id: slackInstalls.id })
    .from(slackInstalls)
    .where(eq(slackInstalls.workspaceId, input.workspaceId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(slackInstalls)
      .set({
        workspaceName: input.workspaceName,
        botTokenCiphertext: enc.ciphertext,
        botTokenIv: enc.iv,
        botUserId: input.botUserId,
        installerUserId: input.installerUserId,
        installedAt: new Date(),
        revokedAt: null,
      })
      .where(eq(slackInstalls.workspaceId, input.workspaceId));
    return;
  }
  await db.insert(slackInstalls).values({
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    botTokenCiphertext: enc.ciphertext,
    botTokenIv: enc.iv,
    botUserId: input.botUserId,
    installerUserId: input.installerUserId,
  });
}

export async function markUninstalled(db: Db, workspaceId: string): Promise<void> {
  await db
    .update(slackInstalls)
    .set({ revokedAt: new Date() })
    .where(eq(slackInstalls.workspaceId, workspaceId));
}
