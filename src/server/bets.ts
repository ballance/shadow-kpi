import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  markets,
  memberships,
  bets,
  ledgerEntries,
  type Bet,
} from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { now } from '@/server/time';

export interface PlaceBetInput {
  marketId: string;
  userId: string;
  side: 'yes' | 'no';
  amount: number;
}

export async function placeBet(db: Db, input: PlaceBetInput): Promise<Bet> {
  if (!Number.isInteger(input.amount) || input.amount < 1) {
    throw new DomainError(
      'AMOUNT_BELOW_MINIMUM',
      'Bet amount must be a positive integer.',
    );
  }

  return await db.transaction(async (tx) => {
    // Acquire row-level lock on the market to serialize concurrent bets.
    await tx.execute(sql`SELECT id FROM market WHERE id = ${input.marketId} FOR UPDATE`);

    const [market] = await tx
      .select()
      .from(markets)
      .where(eq(markets.id, input.marketId))
      .limit(1);

    if (!market) {
      throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
    }

    if (market.creatorId === input.userId) {
      throw new DomainError(
        'CREATOR_CANNOT_BET',
        'You cannot bet on a market you created.',
      );
    }

    if (market.status !== 'open') {
      throw new DomainError('BET_AFTER_LOCKUP', 'Betting is closed for this market.');
    }

    if (now().getTime() >= market.lockupAt.getTime()) {
      throw new DomainError('BET_AFTER_LOCKUP', 'Betting is closed for this market.');
    }

    const membership = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, input.userId),
          eq(memberships.teamId, market.teamId),
        ),
      )
      .limit(1);
    if (membership.length === 0) {
      throw new DomainError('NOT_TEAM_MEMBER', 'You are not a member of this team.');
    }

    const balanceRows = await tx.execute(
      sql`SELECT COALESCE(SUM(amount), 0)::int AS total
          FROM (
            SELECT amount FROM ledger_entry
            WHERE user_id = ${input.userId} AND team_id = ${market.teamId}
            FOR UPDATE
          ) sub`,
    );
    const balance = Number(
      (balanceRows as unknown as Array<{ total: number }>)[0]?.total ?? 0,
    );
    if (balance < input.amount) {
      throw new DomainError(
        'INSUFFICIENT_BALANCE',
        `You have ${balance} doughnuts, need ${input.amount}.`,
      );
    }

    const [placed] = await tx
      .insert(bets)
      .values({
        marketId: input.marketId,
        userId: input.userId,
        side: input.side,
        amount: input.amount,
      })
      .returning();

    await tx.insert(ledgerEntries).values({
      teamId: market.teamId,
      userId: input.userId,
      amount: -input.amount,
      kind: 'stake',
      marketId: input.marketId,
      betId: placed.id,
    });

    return placed;
  });
}
