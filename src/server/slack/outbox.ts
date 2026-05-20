import { sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { slackOutbox } from '@/server/db/schema';

export interface EnqueueInput {
  workspaceId: string;
  targetKind: 'channel' | 'dm';
  targetId: string;
  payload: { text: string; blocks: unknown[] };
  dedupKey: string | null;
}

export async function enqueueOutboxMessages(
  db: Db,
  messages: EnqueueInput[],
): Promise<void> {
  if (messages.length === 0) return;
  await db
    .insert(slackOutbox)
    .values(
      messages.map((m) => ({
        workspaceId: m.workspaceId,
        targetKind: m.targetKind,
        targetId: m.targetId,
        payload: JSON.stringify(m.payload),
        dedupKey: m.dedupKey,
      })),
    )
    .onConflictDoNothing({
      target: slackOutbox.dedupKey,
      where: sql`${slackOutbox.dedupKey} IS NOT NULL`,
    });
}
