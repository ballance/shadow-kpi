import { and, desc, eq, lte, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  markets,
  memberships,
  bets as betsTable,
  ledgerEntries,
  type Market,
  type Bet,
} from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { eventBus } from '@/server/events';
import { now } from '@/server/time';
import { computePayouts, type BetInput } from '@/server/payouts';

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

export interface ResolveMarketInput {
  marketId: string;
  userId: string;
  outcome: 'yes' | 'no';
}

export async function resolveMarket(
  db: Db,
  input: ResolveMarketInput,
): Promise<Market> {
  const updated = await db.transaction(async (tx) => {
    // Step 1: Acquire row lock with minimal raw-SQL query.
    const lockResult = await tx.execute(
      sql`SELECT id FROM market WHERE id = ${input.marketId} FOR UPDATE`,
    );
    const lockRows = lockResult as unknown as Array<{ id: string }>;
    if (lockRows.length === 0) {
      throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
    }

    // Step 2: Fetch typed row via Drizzle (lock is already held).
    const [market] = await tx
      .select()
      .from(markets)
      .where(eq(markets.id, input.marketId))
      .limit(1);
    if (!market) {
      throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
    }

    if (market.creatorId !== input.userId) {
      throw new DomainError(
        'NOT_MARKET_CREATOR',
        'Only the market creator can resolve this market.',
      );
    }

    if (market.status !== 'open' && market.status !== 'locked') {
      throw new DomainError(
        'MARKET_NOT_RESOLVABLE',
        'This market has already been resolved or voided.',
      );
    }

    if (now().getTime() < market.resolvesAt.getTime()) {
      throw new DomainError(
        'RESOLVE_TOO_EARLY',
        'You cannot resolve this market until its resolution time.',
      );
    }

    const allBets = await tx
      .select()
      .from(betsTable)
      .where(eq(betsTable.marketId, input.marketId));

    const inputs: BetInput[] = allBets.map((b) => ({
      id: b.id,
      side: b.side,
      amount: b.amount,
      placedAt: b.placedAt,
    }));
    const { payouts } = computePayouts(inputs, input.outcome);

    for (const p of payouts) {
      const winningBet = allBets.find((b) => b.id === p.betId);
      if (!winningBet) continue;
      await tx.insert(ledgerEntries).values({
        teamId: market.teamId,
        userId: winningBet.userId,
        amount: p.payout,
        kind: 'payout',
        marketId: input.marketId,
        betId: winningBet.id,
      });
    }

    const [row] = await tx
      .update(markets)
      .set({ status: 'resolved', outcome: input.outcome, resolvedAt: now() })
      .where(eq(markets.id, input.marketId))
      .returning();
    return row;
  });

  await eventBus.emit({
    type: 'MarketResolved',
    marketId: updated.id,
    teamId: updated.teamId,
    outcome: updated.outcome as 'yes' | 'no',
  });

  return updated;
}

export interface LockSweepResult {
  lockedIds: string[];
}

export async function lockExpiredMarkets(db: Db): Promise<LockSweepResult> {
  const result = await db
    .update(markets)
    .set({ status: 'locked' })
    .where(and(eq(markets.status, 'open'), lte(markets.lockupAt, now())))
    .returning({ id: markets.id, teamId: markets.teamId });

  for (const row of result) {
    await eventBus.emit({
      type: 'MarketLocked',
      marketId: row.id,
      teamId: row.teamId,
    });
  }
  return { lockedIds: result.map((r) => r.id) };
}

export interface VoidMarketInput {
  marketId: string;
  userId: string;
}

export async function voidMarket(db: Db, input: VoidMarketInput): Promise<Market> {
  const updated = await db.transaction(async (tx) => {
    const lockResult = await tx.execute(
      sql`SELECT id FROM market WHERE id = ${input.marketId} FOR UPDATE`,
    );
    const lockRows = lockResult as unknown as Array<{ id: string }>;
    if (lockRows.length === 0) {
      throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
    }

    const [market] = await tx
      .select()
      .from(markets)
      .where(eq(markets.id, input.marketId))
      .limit(1);
    if (!market) {
      throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
    }

    if (market.creatorId !== input.userId) {
      throw new DomainError(
        'NOT_MARKET_CREATOR',
        'Only the market creator can void this market.',
      );
    }

    if (market.status !== 'open') {
      throw new DomainError(
        'MARKET_NOT_RESOLVABLE',
        'You can only void an open market (before lockup).',
      );
    }

    if (now().getTime() >= market.lockupAt.getTime()) {
      throw new DomainError(
        'BET_AFTER_LOCKUP',
        'You cannot void a market past its lockup time.',
      );
    }

    const allBets = await tx
      .select()
      .from(betsTable)
      .where(eq(betsTable.marketId, input.marketId));

    for (const b of allBets) {
      await tx.insert(ledgerEntries).values({
        teamId: market.teamId,
        userId: b.userId,
        amount: b.amount,
        kind: 'refund',
        marketId: input.marketId,
        betId: b.id,
      });
    }

    const [row] = await tx
      .update(markets)
      .set({ status: 'voided' })
      .where(eq(markets.id, input.marketId))
      .returning();
    return row;
  });

  await eventBus.emit({
    type: 'MarketVoided',
    marketId: updated.id,
    teamId: updated.teamId,
  });

  return updated;
}
