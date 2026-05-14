import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { markets, comments, users } from '@/server/db/schema';

export type ActivityItem =
  | { kind: 'market_created'; at: Date; marketId: string; title: string }
  | {
      kind: 'market_resolved';
      at: Date;
      marketId: string;
      title: string;
      outcome: 'yes' | 'no';
    }
  | {
      kind: 'comment_posted';
      at: Date;
      marketId: string;
      title: string;
      commenterEmail: string;
    };

export function mergeActivityFeed(
  marketItems: ActivityItem[],
  commentItems: ActivityItem[],
  limit: number,
): ActivityItem[] {
  const merged = [...marketItems, ...commentItems];
  merged.sort((a, b) => b.at.getTime() - a.at.getTime());
  return merged.slice(0, limit);
}

export async function getTeamActivityFeed(
  db: Db,
  teamId: string,
  limit = 50,
): Promise<ActivityItem[]> {
  const marketRows = await db
    .select({
      id: markets.id,
      title: markets.title,
      createdAt: markets.createdAt,
      resolvedAt: markets.resolvedAt,
      outcome: markets.outcome,
    })
    .from(markets)
    .where(eq(markets.teamId, teamId))
    .orderBy(desc(markets.createdAt))
    .limit(limit);

  const marketItems: ActivityItem[] = [];
  for (const m of marketRows) {
    marketItems.push({
      kind: 'market_created',
      at: m.createdAt,
      marketId: m.id,
      title: m.title,
    });
    if (m.resolvedAt && m.outcome) {
      marketItems.push({
        kind: 'market_resolved',
        at: m.resolvedAt,
        marketId: m.id,
        title: m.title,
        outcome: m.outcome,
      });
    }
  }

  const commentRows = await db
    .select({
      id: comments.id,
      marketId: comments.marketId,
      title: markets.title,
      createdAt: comments.createdAt,
      commenterEmail: users.email,
    })
    .from(comments)
    .innerJoin(markets, eq(markets.id, comments.marketId))
    .innerJoin(users, eq(users.id, comments.userId))
    .where(eq(markets.teamId, teamId))
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  const commentItems: ActivityItem[] = commentRows.map((c) => ({
    kind: 'comment_posted' as const,
    at: c.createdAt,
    marketId: c.marketId,
    title: c.title,
    commenterEmail: c.commenterEmail,
  }));

  return mergeActivityFeed(marketItems, commentItems, limit);
}
