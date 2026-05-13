import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { markets, memberships, bets as betsTable, type Market, type Bet } from '@/server/db/schema';
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

export type MarketStatus = 'open' | 'locked' | 'resolved' | 'voided';

export async function listMarketsForTeam(
  db: Db,
  teamId: string,
  status?: MarketStatus,
): Promise<Market[]> {
  const whereClause = status
    ? and(eq(markets.teamId, teamId), eq(markets.status, status))
    : eq(markets.teamId, teamId);
  return await db
    .select()
    .from(markets)
    .where(whereClause)
    .orderBy(desc(markets.createdAt));
}

export interface MarketDetail {
  market: Market;
  pools: { yes: number; no: number };
  bets: Bet[];
}

export async function getMarketDetail(
  db: Db,
  marketId: string,
): Promise<MarketDetail | null> {
  const [market] = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
  if (!market) return null;

  const allBets = await db
    .select()
    .from(betsTable)
    .where(eq(betsTable.marketId, marketId));

  const pools = allBets.reduce(
    (acc, b) => {
      if (b.side === 'yes') acc.yes += b.amount;
      else acc.no += b.amount;
      return acc;
    },
    { yes: 0, no: 0 },
  );

  return { market, pools, bets: allBets };
}
