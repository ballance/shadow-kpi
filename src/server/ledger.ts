import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { bets, ledgerEntries } from '@/server/db/schema';
import { now } from '@/server/time';

export const WEEKLY_ALLOWANCE = 12;

export interface UserTeamRef {
  userId: string;
  teamId: string;
}

export interface UserTeamWeekRef extends UserTeamRef {
  weekStart: Date;
}

export async function getBalance(db: Db, { userId, teamId }: UserTeamRef): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.teamId, teamId)));
  return result[0]?.total ?? 0;
}

export async function getSpendableAllowanceForWeek(
  db: Db,
  { userId, teamId, weekStart }: UserTeamWeekRef,
): Promise<number> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const allowanceResult = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.userId, userId),
        eq(ledgerEntries.teamId, teamId),
        gte(ledgerEntries.createdAt, weekStart),
        lt(ledgerEntries.createdAt, weekEnd),
        inArray(ledgerEntries.kind, ['allowance_grant', 'allowance_evaporate', 'stake']),
      ),
    );

  const refundResult = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .innerJoin(bets, eq(ledgerEntries.betId, bets.id))
    .where(
      and(
        eq(ledgerEntries.userId, userId),
        eq(ledgerEntries.teamId, teamId),
        eq(ledgerEntries.kind, 'refund'),
        gte(bets.placedAt, weekStart),
        lt(bets.placedAt, weekEnd),
        gte(ledgerEntries.createdAt, weekStart),
        lt(ledgerEntries.createdAt, weekEnd),
      ),
    );

  const raw = (allowanceResult[0]?.total ?? 0) + (refundResult[0]?.total ?? 0);
  return raw < 0 ? 0 : raw;
}

export async function getSpendableAllowance(
  db: Db,
  ref: UserTeamRef,
): Promise<number> {
  return await getSpendableAllowanceForWeek(db, {
    ...ref,
    weekStart: currentWeekStart(),
  });
}

export async function grantInitialAllowance(
  db: Db,
  { userId, teamId }: UserTeamRef,
): Promise<void> {
  await db.insert(ledgerEntries).values({
    userId,
    teamId,
    kind: 'allowance_grant',
    amount: WEEKLY_ALLOWANCE,
  });
}

export function currentWeekStart(): Date {
  const n = now();
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  const dow = d.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}
