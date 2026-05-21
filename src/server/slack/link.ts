import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { slackUserLinks } from '@/server/db/schema';

export async function upsertUserLink(
  db: Db,
  input: { userId: string; workspaceId: string; slackUserId: string },
): Promise<void> {
  await db
    .insert(slackUserLinks)
    .values(input)
    .onConflictDoUpdate({
      target: [slackUserLinks.userId, slackUserLinks.workspaceId],
      set: {
        slackUserId: input.slackUserId,
        linkedAt: sql`now()`,
      },
    });
}

export async function deleteUserLink(
  db: Db,
  input: { userId: string; workspaceId: string },
): Promise<void> {
  await db
    .delete(slackUserLinks)
    .where(
      and(
        eq(slackUserLinks.userId, input.userId),
        eq(slackUserLinks.workspaceId, input.workspaceId),
      ),
    );
}
