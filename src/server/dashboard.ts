import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { markets, bets as betsTable, type Market, type Bet } from '@/server/db/schema';
import { aggregatePools } from '@/server/markets';
import { now } from '@/server/time';

export const LAST_SEEN_STALE_MS = 30 * 60_000;

export function shouldAdvanceLastSeen(
  previous: Date | null,
  now: Date,
  staleMs: number = LAST_SEEN_STALE_MS,
): boolean {
  if (previous === null) return true;
  return now.getTime() - previous.getTime() > staleMs;
}

export interface LockingSoonRow {
  market: Market;
  pools: { yes: number; no: number };
  yourStake: { side: 'yes' | 'no'; amount: number } | null;
}

export async function listLockingSoon(
  db: Db,
  args: { teamId: string; userId: string; withinHours?: number; limit?: number },
): Promise<LockingSoonRow[]> {
  const windowHours = args.withinHours ?? 168;
  const limit = args.limit ?? 3;
  const start = now();
  const end = new Date(start.getTime() + windowHours * 60 * 60_000);

  const openMarkets = await db
    .select()
    .from(markets)
    .where(
      and(
        eq(markets.teamId, args.teamId),
        eq(markets.status, 'open'),
        gt(markets.lockupAt, start),
        lte(markets.lockupAt, end),
      ),
    )
    .orderBy(asc(markets.lockupAt))
    .limit(limit);

  if (openMarkets.length === 0) return [];

  const marketIds = openMarkets.map((m) => m.id);
  const allBets = await db
    .select()
    .from(betsTable)
    .where(inArray(betsTable.marketId, marketIds));

  const betsByMarket = new Map<string, Bet[]>();
  for (const b of allBets) {
    const list = betsByMarket.get(b.marketId) ?? [];
    list.push(b);
    betsByMarket.set(b.marketId, list);
  }

  return openMarkets.map((market) => {
    const marketBets = betsByMarket.get(market.id) ?? [];
    const pools = aggregatePools(marketBets);
    const userBets = marketBets.filter((b) => b.userId === args.userId);
    let yourStake: LockingSoonRow['yourStake'] = null;
    if (userBets.length > 0) {
      const side = userBets[0].side;
      const amount = userBets
        .filter((b) => b.side === side)
        .reduce((acc, b) => acc + b.amount, 0);
      yourStake = { side, amount };
    }
    return { market, pools, yourStake };
  });
}

export interface OpenPositionRow {
  market: Market;
  pools: { yes: number; no: number };
  yourStake: { side: 'yes' | 'no'; amount: number };
}

export async function listOpenPositions(
  db: Db,
  args: { teamId: string; userId: string },
): Promise<OpenPositionRow[]> {
  const userBets = await db
    .select({ marketId: betsTable.marketId })
    .from(betsTable)
    .innerJoin(markets, eq(betsTable.marketId, markets.id))
    .where(
      and(
        eq(betsTable.userId, args.userId),
        eq(markets.teamId, args.teamId),
        inArray(markets.status, ['open', 'locked']),
      ),
    );

  const marketIds = Array.from(new Set(userBets.map((r) => r.marketId)));
  if (marketIds.length === 0) return [];

  const [openMarkets, allBets] = await Promise.all([
    db.select().from(markets).where(inArray(markets.id, marketIds))
      .orderBy(asc(markets.lockupAt)),
    db.select().from(betsTable).where(inArray(betsTable.marketId, marketIds)),
  ]);

  const betsByMarket = new Map<string, Bet[]>();
  for (const b of allBets) {
    const list = betsByMarket.get(b.marketId) ?? [];
    list.push(b);
    betsByMarket.set(b.marketId, list);
  }

  return openMarkets.map((market) => {
    const marketBets = betsByMarket.get(market.id) ?? [];
    const pools = aggregatePools(marketBets);
    const userMarketBets = marketBets.filter((b) => b.userId === args.userId);
    const side = userMarketBets[0].side;
    const amount = userMarketBets
      .filter((b) => b.side === side)
      .reduce((acc, b) => acc + b.amount, 0);
    return { market, pools, yourStake: { side, amount } };
  });
}
