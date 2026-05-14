import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { bets, memberships, notifications, markets, type Notification } from '@/server/db/schema';
import type { DomainEvent } from '@/server/events';

export async function inAppNotificationSubscriber(
  db: Db,
  event: DomainEvent,
): Promise<void> {
  switch (event.type) {
    case 'MarketCreated': {
      const recipients = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(eq(memberships.teamId, event.teamId));
      const targets = recipients.filter((r) => r.userId !== event.creatorId);
      if (targets.length === 0) return;
      await db.insert(notifications).values(
        targets.map((r) => ({
          userId: r.userId,
          kind: 'market_created',
          marketId: event.marketId,
          payload: null as string | null,
        })),
      );
      return;
    }
    case 'MarketLocked':
    case 'MarketVoided': {
      const bettors = await db
        .select({ userId: bets.userId })
        .from(bets)
        .where(eq(bets.marketId, event.marketId));
      const uniq = Array.from(new Set(bettors.map((b) => b.userId)));
      if (uniq.length === 0) return;
      const kind = event.type === 'MarketLocked' ? 'market_locked' : 'market_voided';
      await db.insert(notifications).values(
        uniq.map((userId) => ({
          userId,
          kind,
          marketId: event.marketId,
          payload: null as string | null,
        })),
      );
      return;
    }
    case 'MarketResolved': {
      const bettors = await db
        .select({ userId: bets.userId })
        .from(bets)
        .where(eq(bets.marketId, event.marketId));
      const uniq = Array.from(new Set(bettors.map((b) => b.userId)));
      if (uniq.length === 0) return;
      await db.insert(notifications).values(
        uniq.map((userId) => ({
          userId,
          kind: 'market_resolved',
          marketId: event.marketId,
          payload: JSON.stringify({ outcome: event.outcome }),
        })),
      );
      return;
    }
    case 'CommentPosted': {
      const [marketRow] = await db
        .select({ creatorId: markets.creatorId })
        .from(markets)
        .where(eq(markets.id, event.marketId))
        .limit(1);
      const bettors = await db
        .select({ userId: bets.userId })
        .from(bets)
        .where(eq(bets.marketId, event.marketId));
      const recipientSet = new Set<string>();
      if (marketRow?.creatorId) recipientSet.add(marketRow.creatorId);
      for (const b of bettors) recipientSet.add(b.userId);
      recipientSet.delete(event.commenterId);
      const recipients = Array.from(recipientSet);
      if (recipients.length === 0) return;
      await db.insert(notifications).values(
        recipients.map((userId) => ({
          userId,
          kind: 'comment_posted',
          marketId: event.marketId,
          payload: JSON.stringify({ commenterId: event.commenterId }),
        })),
      );
      return;
    }
  }
}

export interface NotificationRow extends Notification {
  marketTeamId: string | null;
}

export async function listNotifications(
  db: Db,
  userId: string,
  limit = 20,
): Promise<NotificationRow[]> {
  const rows = await db
    .select({
      n: notifications,
      marketTeamId: markets.teamId,
    })
    .from(notifications)
    .leftJoin(markets, eq(markets.id, notifications.marketId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.n, marketTeamId: r.marketTeamId ?? null }));
}

export async function getUnreadCount(db: Db, userId: string): Promise<number> {
  const result = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return result[0]?.n ?? 0;
}

export async function markAllRead(db: Db, userId: string): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return result.length;
}
