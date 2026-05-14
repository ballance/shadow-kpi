import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { comments, memberships, markets, type Comment } from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { eventBus } from '@/server/events';

export interface AddCommentInput {
  marketId: string;
  userId: string;
  body: string;
}

export async function addComment(db: Db, input: AddCommentInput): Promise<Comment> {
  const body = input.body.trim();
  if (body.length === 0) {
    throw new DomainError('VALIDATION_FAILED', 'Comment body cannot be empty.');
  }
  if (body.length > 2000) {
    throw new DomainError('VALIDATION_FAILED', 'Comment is too long (max 2000 chars).');
  }

  const [market] = await db
    .select({ teamId: markets.teamId })
    .from(markets)
    .where(eq(markets.id, input.marketId))
    .limit(1);
  if (!market) {
    throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
  }

  const membership = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, input.userId), eq(memberships.teamId, market.teamId)),
    )
    .limit(1);
  if (membership.length === 0) {
    throw new DomainError('NOT_TEAM_MEMBER', 'You are not a member of this team.');
  }

  const [created] = await db
    .insert(comments)
    .values({
      marketId: input.marketId,
      userId: input.userId,
      body,
    })
    .returning();

  await eventBus.emit({
    type: 'CommentPosted',
    marketId: input.marketId,
    teamId: market.teamId,
    commenterId: input.userId,
  });

  return created;
}

export async function listCommentsForMarket(
  db: Db,
  marketId: string,
): Promise<Comment[]> {
  return await db
    .select()
    .from(comments)
    .where(eq(comments.marketId, marketId))
    .orderBy(asc(comments.createdAt));
}
