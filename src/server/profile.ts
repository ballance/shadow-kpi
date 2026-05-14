import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { bets, markets, type Bet, type Market } from '@/server/db/schema';

export interface BetWithMarket {
  bet: Bet;
  market: Pick<Market, 'id' | 'title' | 'status' | 'outcome'>;
}

export interface ProfileData {
  bets: BetWithMarket[];
  winCount: number;
  resolvedCount: number;
}

export async function getProfile(
  db: Db,
  { userId, teamId }: { userId: string; teamId: string },
): Promise<ProfileData> {
  const rows = await db
    .select({ bet: bets, market: markets })
    .from(bets)
    .innerJoin(markets, eq(markets.id, bets.marketId))
    .where(and(eq(bets.userId, userId), eq(markets.teamId, teamId)))
    .orderBy(desc(bets.placedAt));

  let winCount = 0;
  let resolvedCount = 0;
  for (const r of rows) {
    if (r.market.status === 'resolved' && r.market.outcome) {
      resolvedCount += 1;
      if (r.bet.side === r.market.outcome) winCount += 1;
    }
  }

  return {
    bets: rows.map((r) => ({
      bet: r.bet,
      market: {
        id: r.market.id,
        title: r.market.title,
        status: r.market.status,
        outcome: r.market.outcome,
      },
    })),
    winCount,
    resolvedCount,
  };
}
