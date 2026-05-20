import { and, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { slackUserLinks } from '@/server/db/schema';

export async function upsertUserLink(
  db: Db,
  input: { userId: string; workspaceId: string; slackUserId: string },
): Promise<void> {
  const existing = await db
    .select({ id: slackUserLinks.id })
    .from(slackUserLinks)
    .where(
      and(
        eq(slackUserLinks.userId, input.userId),
        eq(slackUserLinks.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(slackUserLinks)
      .set({ slackUserId: input.slackUserId, linkedAt: new Date() })
      .where(eq(slackUserLinks.id, existing[0].id));
    return;
  }
  await db.insert(slackUserLinks).values(input);
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
