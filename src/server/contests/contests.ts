import { and, desc, eq, lte, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  priceContests,
  contestGuesses,
  teamContestConfigs,
  ledgerEntries,
  memberships,
  type PriceContest,
  type TeamContestConfig,
} from '@/server/db/schema';
import { now, etDateString, etTimestamp } from '@/server/time';
import { getPriceProvider } from '@/server/prices/provider';
import { rankGuesses, type Winner } from '@/server/contests/scoring';
import { pickSymbol } from '@/server/contests/config';
import { eventBus } from '@/server/events';

const VOID_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

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
    // onConflictDoNothing closes the check-then-insert race (cron overlap): a
    // concurrent insert wins the unique index and we get no returned row.
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
      .onConflictDoNothing()
      .returning({ id: priceContests.id });
    if (!row) continue; // already created by a concurrent run — don't advance cursor
    await db
      .update(teamContestConfigs)
      .set({ rotationCursor: sql`rotation_cursor + 1` })
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

// Cross-team IDOR guard: contests are looked up by id alone, so both
// user-initiated entry points must confirm the caller is on the contest's
// team before reading/minting anything further.
async function assertMember(db: Db, userId: string, teamId: string): Promise<void> {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.teamId, teamId)));
  if (!m) throw new ContestError('NOT_A_MEMBER');
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
  await assertMember(db, input.userId, contest.teamId);
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

// ─── Task 9: resolution, prize minting, manual fallback ───────────────────

// Exported for the double-mint idempotency test — call sites should prefer
// resolveDueContests/manualResolve.
export async function mintPrizesAndResolve(
  db: Db,
  contestId: string,
  actualCloseCents: number,
  source: 'api' | 'manual',
  resolvedBy: string | null,
): Promise<void> {
  const result = await db.transaction(async (tx) => {
    const lockResult = await tx.execute(
      sql`SELECT id FROM price_contest WHERE id = ${contestId} FOR UPDATE`,
    );
    const lockRows = lockResult as unknown as Array<{ id: string }>;
    if (lockRows.length === 0) return null;

    const [contest] = await tx
      .select()
      .from(priceContests)
      .where(eq(priceContests.id, contestId))
      .limit(1);
    // Already resolved/voided — no-op so resolveDueContests/manualResolve can retry safely.
    if (!contest || contest.status !== 'open') return null;

    const guesses = await tx
      .select()
      .from(contestGuesses)
      .where(eq(contestGuesses.contestId, contestId));
    const prizeTiers: number[] = JSON.parse(contest.prizeTiers);
    const winners = rankGuesses(
      guesses.map((g) => ({ userId: g.userId, guessCents: g.guessCents, createdAt: g.createdAt })),
      actualCloseCents,
      prizeTiers,
    );

    for (const w of winners) {
      await tx.insert(ledgerEntries).values({
        teamId: contest.teamId,
        userId: w.userId,
        amount: w.prizeCoins,
        kind: 'contest_prize',
        contestId: contest.id,
      });
    }

    await tx
      .update(priceContests)
      .set({
        status: 'resolved',
        actualCloseCents,
        resolutionSource: source,
        resolvedBy,
        resolvedAt: now(),
      })
      .where(eq(priceContests.id, contestId));

    return { contest, winners };
  });

  if (!result) return;
  await eventBus.emit({
    type: 'ContestResolved',
    contestId: result.contest.id,
    teamId: result.contest.teamId,
    symbol: result.contest.symbol,
    contestDate: result.contest.contestDate,
    actualCloseCents,
    winners: result.winners.map((w) => ({ userId: w.userId, place: w.place, prizeCoins: w.prizeCoins })),
  });
}

export async function resolveDueContests(db: Db, provider = getPriceProvider()): Promise<void> {
  const due = await db
    .select()
    .from(priceContests)
    .where(and(eq(priceContests.status, 'open'), lte(priceContests.resolvesAfter, now())));

  for (const contest of due) {
    const res = await provider.getDailyClose(contest.symbol, contest.contestDate);
    if ('closeCents' in res) {
      await mintPrizesAndResolve(db, contest.id, res.closeCents, 'api', null);
      continue;
    }
    const contestDateStart = etTimestamp(contest.contestDate, 0, 0);
    if (now().getTime() - contestDateStart.getTime() > VOID_AFTER_MS) {
      await db
        .update(priceContests)
        .set({ status: 'voided', resolvedAt: now() })
        .where(eq(priceContests.id, contest.id));
    }
    // else: no close price yet — leave open, resolveDueContests will retry later.
  }
}

export interface ManualResolveInput {
  contestId: string;
  userId: string;
  actualCloseCents: number;
}

export async function manualResolve(db: Db, input: ManualResolveInput): Promise<void> {
  const [contest] = await db
    .select()
    .from(priceContests)
    .where(eq(priceContests.id, input.contestId))
    .limit(1);
  if (!contest) throw new ContestError('CONTEST_NOT_FOUND');
  await assertMember(db, input.userId, contest.teamId);
  if (contest.status !== 'open' || now().getTime() < contest.resolvesAfter.getTime()) {
    throw new ContestError('NOT_RESOLVABLE_YET');
  }
  await mintPrizesAndResolve(db, contest.id, input.actualCloseCents, 'manual', input.userId);
}
