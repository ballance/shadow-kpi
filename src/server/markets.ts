import { and, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { markets, memberships, type Market } from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { eventBus } from '@/server/events';
import { now } from '@/server/time';

export interface CreateMarketInput {
  teamId: string;
  creatorId: string;
  title: string;
  description: string | null;
  lockupAt: Date;
  resolvesAt: Date;
}

export async function createMarket(db: Db, input: CreateMarketInput): Promise<Market> {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new DomainError('VALIDATION_FAILED', 'Market title cannot be empty.');
  }
  const currentTime = now();
  if (input.lockupAt.getTime() <= currentTime.getTime()) {
    throw new DomainError('VALIDATION_FAILED', 'Lockup time must be in the future.');
  }
  if (input.resolvesAt.getTime() < input.lockupAt.getTime()) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'Resolves time cannot be before lockup time.',
    );
  }

  const membership = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, input.creatorId), eq(memberships.teamId, input.teamId)),
    )
    .limit(1);
  if (membership.length === 0) {
    throw new DomainError('NOT_TEAM_MEMBER', 'You are not a member of this team.');
  }

  const [created] = await db
    .insert(markets)
    .values({
      teamId: input.teamId,
      creatorId: input.creatorId,
      title,
      description: input.description?.trim() || null,
      lockupAt: input.lockupAt,
      resolvesAt: input.resolvesAt,
    })
    .returning();

  await eventBus.emit({
    type: 'MarketCreated',
    marketId: created.id,
    teamId: created.teamId,
    creatorId: created.creatorId,
  });

  return created;
}
