import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  priceContests,
  contestGuesses,
  teamContestConfigs,
  type PriceContest,
  type TeamContestConfig,
} from '@/server/db/schema';
import { now, etDateString, etTimestamp } from '@/server/time';
import { getPriceProvider } from '@/server/prices/provider';
import { rankGuesses, type Winner } from '@/server/contests/scoring';
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

// ─── Task 8: reads + guess submission ─────────────────────────────────────

export interface CurrentContest {
  contest: PriceContest;
  myGuessCents: number | null;
  submissionsClosed: boolean;
}

export async function getCurrentContest(
  db: Db,
  teamId: string,
  userId: string,
): Promise<CurrentContest | null> {
  const [contest] = await db
    .select()
    .from(priceContests)
    .where(and(eq(priceContests.teamId, teamId), eq(priceContests.status, 'open')))
    .orderBy(desc(priceContests.contestDate))
    .limit(1);
  if (!contest) return null;

  const [guess] = await db
    .select({ guessCents: contestGuesses.guessCents })
    .from(contestGuesses)
    .where(and(eq(contestGuesses.contestId, contest.id), eq(contestGuesses.userId, userId)));

  return {
    contest,
    myGuessCents: guess?.guessCents ?? null,
    submissionsClosed: now().getTime() >= contest.submissionsCloseAt.getTime(),
  };
}

export interface ContestSummary {
  contest: PriceContest;
  winners: Winner[];
  myResult: { guessCents: number; place: number | null } | null;
}

export async function listPreviousContests(
  db: Db,
  teamId: string,
  userId: string,
  limit = 20,
): Promise<ContestSummary[]> {
  const contests = await db
    .select()
    .from(priceContests)
    .where(eq(priceContests.teamId, teamId))
    .orderBy(desc(priceContests.contestDate))
    .limit(limit);

  const out: ContestSummary[] = [];
  for (const contest of contests) {
    const guesses = await db
      .select()
      .from(contestGuesses)
      .where(eq(contestGuesses.contestId, contest.id));
    const myGuess = guesses.find((g) => g.userId === userId) ?? null;

    if (contest.status === 'resolved' && contest.actualCloseCents !== null) {
      const prizeTiers: number[] = JSON.parse(contest.prizeTiers);
      const winners = rankGuesses(
        guesses.map((g) => ({ userId: g.userId, guessCents: g.guessCents, createdAt: g.createdAt })),
        contest.actualCloseCents,
        prizeTiers,
      );
      const myWin = winners.find((w) => w.userId === userId) ?? null;
      out.push({
        contest,
        winners,
        myResult: myGuess ? { guessCents: myGuess.guessCents, place: myWin?.place ?? null } : null,
      });
    } else {
      out.push({ contest, winners: [], myResult: null });
    }
  }
  return out;
}

export class ContestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ContestError';
  }
}

export interface SubmitGuessInput {
  contestId: string;
  userId: string;
  guessCents: number;
}

export async function submitGuess(db: Db, input: SubmitGuessInput): Promise<void> {
  const [contest] = await db
    .select()
    .from(priceContests)
    .where(eq(priceContests.id, input.contestId))
    .limit(1);
  if (!contest) throw new ContestError('CONTEST_NOT_FOUND');
  if (contest.status !== 'open' || now().getTime() >= contest.submissionsCloseAt.getTime()) {
    throw new ContestError('SUBMISSIONS_CLOSED');
  }

  await db
    .insert(contestGuesses)
    .values({ contestId: input.contestId, userId: input.userId, guessCents: input.guessCents })
    .onConflictDoUpdate({
      target: [contestGuesses.contestId, contestGuesses.userId],
      set: { guessCents: input.guessCents, updatedAt: now() },
    });
}
