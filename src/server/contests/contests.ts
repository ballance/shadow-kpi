import { and, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  priceContests,
  teamContestConfigs,
  type TeamContestConfig,
} from '@/server/db/schema';
import { now, etDateString, etTimestamp } from '@/server/time';
import { getPriceProvider } from '@/server/prices/provider';
import { pickSymbol } from '@/server/contests/config';

// ─── Task 7: config accessors + daily contest creation ───────────────────

export async function getTeamContestConfig(
  db: Db,
  teamId: string,
): Promise<TeamContestConfig | null> {
  const [row] = await db
    .select()
    .from(teamContestConfigs)
    .where(eq(teamContestConfigs.teamId, teamId))
    .limit(1);
  return row ?? null;
}

export interface TeamContestConfigPatch {
  enabled?: boolean;
  symbols?: string[];
  prizeTiers?: number[];
}

export async function upsertTeamContestConfig(
  db: Db,
  teamId: string,
  patch: TeamContestConfigPatch,
): Promise<TeamContestConfig> {
  const insertValues: typeof teamContestConfigs.$inferInsert = { teamId };
  // teamId included so the SET clause is never empty when a caller passes {}.
  const updateValues: Partial<typeof teamContestConfigs.$inferInsert> = { teamId };
  if (patch.enabled !== undefined) {
    insertValues.enabled = patch.enabled;
    updateValues.enabled = patch.enabled;
  }
  if (patch.symbols !== undefined) {
    insertValues.symbols = JSON.stringify(patch.symbols);
    updateValues.symbols = insertValues.symbols;
  }
  if (patch.prizeTiers !== undefined) {
    insertValues.prizeTiers = JSON.stringify(patch.prizeTiers);
    updateValues.prizeTiers = insertValues.prizeTiers;
  }
  // rotationCursor is intentionally never touched here — createDailyContests owns it.
  const [row] = await db
    .insert(teamContestConfigs)
    .values(insertValues)
    .onConflictDoUpdate({ target: teamContestConfigs.teamId, set: updateValues })
    .returning();
  return row;
}

export async function createDailyContests(
  db: Db,
  provider = getPriceProvider(),
): Promise<string[]> {
  const today = etDateString(now());
  if (!(await provider.isTradingDay(today))) return [];

  const configs = await db
    .select()
    .from(teamContestConfigs)
    .where(eq(teamContestConfigs.enabled, true));

  const created: string[] = [];
  for (const cfg of configs) {
    const symbols: string[] = JSON.parse(cfg.symbols);
    if (symbols.length === 0) continue;

    const existing = await db
      .select({ id: priceContests.id })
      .from(priceContests)
      .where(and(eq(priceContests.teamId, cfg.teamId), eq(priceContests.contestDate, today)));
    if (existing.length > 0) continue;

    const symbol = pickSymbol(symbols, cfg.rotationCursor);
    const [row] = await db
      .insert(priceContests)
      .values({
        teamId: cfg.teamId,
        symbol,
        contestDate: today,
        submissionsCloseAt: etTimestamp(today, 12, 0),
        resolvesAfter: etTimestamp(today, 16, 15),
        prizeTiers: cfg.prizeTiers,
      })
      .returning({ id: priceContests.id });
    await db
      .update(teamContestConfigs)
      .set({ rotationCursor: cfg.rotationCursor + 1 })
      .where(eq(teamContestConfigs.teamId, cfg.teamId));
    created.push(row.id);
  }
  return created;
}
