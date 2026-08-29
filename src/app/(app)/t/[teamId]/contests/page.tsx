import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { inArray } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import {
  getCurrentContest,
  listPreviousContests,
  manualResolve,
  submitGuess,
} from '@/server/contests/contests';
import { parseDollarsToCents } from '@/server/contests/config';
import { now } from '@/server/time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { CurrentContestCard, ordinal } from '@/components/dashboard/current-contest-card';

interface ContestsPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function ContestsPage({ params, searchParams }: ContestsPageProps) {
  const session = await auth();
  if (!session?.user) redirect('/signin');
  const { teamId } = await params;
  const { error } = await searchParams;
  const userId = session.user.id;

  const [currentContest, previousContests] = await Promise.all([
    getCurrentContest(db, teamId, userId),
    listPreviousContests(db, teamId, userId),
  ]);

  const previous = previousContests.filter((c) => c.contest.id !== currentContest?.contest.id);

  const winnerIds = Array.from(
    new Set(previous.flatMap((c) => c.winners.map((w) => w.userId))),
  );
  const userRows =
    winnerIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, winnerIds))
      : [];
  const nameById = new Map(userRows.map((u) => [u.id, u.name ?? u.displayName ?? 'Someone']));

  async function submitGuessAction(formData: FormData) {
    'use server';
    const actionSession = await auth();
    if (!actionSession?.user) redirect('/signin');
    const contestId = String(formData.get('contestId'));
    try {
      const guessCents = parseDollarsToCents(String(formData.get('guess')));
      await submitGuess(db, { contestId, userId: actionSession.user.id, guessCents });
    } catch {
      redirect(`/t/${teamId}/contests?error=1`);
    }
    revalidatePath(`/t/${teamId}/contests`);
  }

  async function manualResolveAction(formData: FormData) {
    'use server';
    const actionSession = await auth();
    if (!actionSession?.user) redirect('/signin');
    try {
      await manualResolve(db, {
        contestId: String(formData.get('contestId')),
        userId: actionSession.user.id,
        actualCloseCents: parseDollarsToCents(String(formData.get('close'))),
      });
    } catch {
      redirect(`/t/${teamId}/contests?error=1`);
    }
    revalidatePath(`/t/${teamId}/contests`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-dim font-semibold">Team</div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Contests</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/settings/contest`}>Settings</Link>
          </Button>
          <Link href={`/t/${teamId}`} className="text-xs text-fg-muted hover:text-fg w-fit">
            ← Back to dashboard
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
          That didn&apos;t go through. Check the value and try again.
        </div>
      )}

      {currentContest && <CurrentContestCard data={currentContest} action={submitGuessAction} />}

      <div className="flex flex-col gap-3">
        <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">
          Previous contests
        </div>

        {previous.length === 0 ? (
          <Card>
            <EmptyState title="No contests yet" description="Check back after the first one runs." />
          </Card>
        ) : (
          previous.map(({ contest, winners, myResult }) => {
            const prizeTiers: number[] = JSON.parse(contest.prizeTiers);
            const canManuallyResolve =
              contest.status === 'open' &&
              contest.actualCloseCents === null &&
              now().getTime() >= contest.resolvesAfter.getTime();

            return (
              <Card key={contest.id}>
                <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm">
                    {contest.symbol} · {contest.contestDate}
                  </CardTitle>
                  <div className="text-xs text-fg-muted">
                    Prizes: {prizeTiers.map((coins, i) => `${ordinal(i)}: ${coins} coins`).join(' · ')}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {contest.status === 'resolved' && contest.actualCloseCents !== null ? (
                    <>
                      <div className="text-sm text-fg">
                        Close:{' '}
                        <span className="font-mono font-semibold">
                          ${(contest.actualCloseCents / 100).toFixed(2)}
                        </span>
                      </div>
                      {winners.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <div className="text-xs font-semibold text-fg-dim uppercase tracking-wide">
                            Winners
                          </div>
                          <ul className="text-sm text-fg flex flex-col gap-0.5">
                            {winners.map((w) => (
                              <li key={w.userId}>
                                {ordinal(w.place - 1)}: {nameById.get(w.userId) ?? 'Someone'} — $
                                {(w.guessCents / 100).toFixed(2)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="text-xs text-fg-muted">
                        {myResult === null
                          ? 'Did not participate.'
                          : myResult.place !== null
                            ? `You placed ${ordinal(myResult.place - 1)}.`
                            : `You guessed $${(myResult.guessCents / 100).toFixed(2)} — no prize this time.`}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-fg-muted">Results coming soon.</div>
                      {canManuallyResolve && (
                        <form action={manualResolveAction} className="flex items-center gap-2">
                          <input type="hidden" name="contestId" value={contest.id} />
                          <Input
                            name="close"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Actual close"
                            required
                            className="max-w-[140px]"
                          />
                          <Button type="submit" size="sm" variant="outline">
                            Enter actual close
                          </Button>
                        </form>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
