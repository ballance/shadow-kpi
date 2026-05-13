import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { ledgerEntries } from '@/server/db/schema';
import { now } from '@/server/time';

export const WEEKLY_ALLOWANCE = 12;

export interface UserTeamRef {
  userId: string;
  teamId: string;
}

export async function getBalance(db: Db, { userId, teamId }: UserTeamRef): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.teamId, teamId)));
  return result[0]?.total ?? 0;
}

export async function getSpendableAllowance(
  db: Db,
  { userId, teamId }: UserTeamRef,
): Promise<number> {
  const weekStart = currentWeekStart();
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.userId, userId),
        eq(ledgerEntries.teamId, teamId),
        gte(ledgerEntries.createdAt, weekStart),
        inArray(ledgerEntries.kind, ['allowance_grant', 'allowance_evaporate', 'stake']),
      ),
    );
  const raw = result[0]?.total ?? 0;
  return raw < 0 ? 0 : raw;
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

/** Most recent Monday 00:00:00 UTC at or before `now()`. */
export function currentWeekStart(): Date {
  const n = now();
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7; // Mon=0, Sun=6
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}
