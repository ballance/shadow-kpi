import { and, eq, gte } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { memberships, ledgerEntries } from '@/server/db/schema';
import {
  WEEKLY_ALLOWANCE,
  currentWeekStart,
  getSpendableAllowanceForWeek,
} from '@/server/ledger';

export interface WeeklyResetResult {
  resetsApplied: number;
}

export async function runWeeklyReset(db: Db): Promise<WeeklyResetResult> {
  const weekStart = currentWeekStart();
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const allMemberships = await db.select().from(memberships);

  let resetsApplied = 0;
  for (const m of allMemberships) {
    const applied = await db.transaction(async (tx) => {
      const recentGrants = await tx
        .select()
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.userId, m.userId),
            eq(ledgerEntries.teamId, m.teamId),
            eq(ledgerEntries.kind, 'allowance_grant'),
            gte(ledgerEntries.createdAt, weekStart),
          ),
        )
        .limit(1);
      if (recentGrants.length > 0) return false;

      const remaining = await getSpendableAllowanceForWeek(tx as unknown as Db, {
        userId: m.userId,
        teamId: m.teamId,
        weekStart: prevWeekStart,
      });
      if (remaining > 0) {
        await tx.insert(ledgerEntries).values({
          userId: m.userId,
          teamId: m.teamId,
          kind: 'allowance_evaporate',
          amount: -remaining,
        });
      }

      await tx.insert(ledgerEntries).values({
        userId: m.userId,
        teamId: m.teamId,
        kind: 'allowance_grant',
        amount: WEEKLY_ALLOWANCE,
      });
      return true;
    });
    if (applied) resetsApplied += 1;
  }

  return { resetsApplied };
}
