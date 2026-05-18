import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { rotateInviteCode } from '@/server/teams';
import { listMarketsForTeam } from '@/server/markets';
import {
  listLockingSoon,
  listOpenPositions,
  listResolvedSince,
  readAndAdvanceLastSeen,
} from '@/server/dashboard';
import { DomainError } from '@/server/errors';
import { now } from '@/server/time';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/status-pill';
import { EmptyState } from '@/components/empty-state';
import { DashboardSection } from '@/components/dashboard/dashboard-section';
import { MarketRow } from '@/components/dashboard/market-row';

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ status?: string }>;
}

const FIRST_VISIT_LOOKBACK_DAYS = 7;

export default async function TeamDashboardPage({ params, searchParams }: TeamPageProps) {
  const { teamId } = await params;
  const { status } = await searchParams;
  const activeTab: 'open' | 'closed' | 'all' =
    status === 'closed' || status === 'all' ? status : 'open';
  const session = await auth();
  if (!session?.user) return null;

  const userId = session.user.id;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const lastSeen = await readAndAdvanceLastSeen(db, { userId, teamId });
  const sinceForResolved =
    lastSeen.previous ??
    new Date(now().getTime() - FIRST_VISIT_LOOKBACK_DAYS * 24 * 60 * 60_000);

  const [balance, allowance, lockingSoon, openPositions, resolvedAway, marketRows] =
    await Promise.all([
      getBalance(db, { userId, teamId }),
      getSpendableAllowance(db, { userId, teamId }),
      listLockingSoon(db, { teamId, userId }),
      listOpenPositions(db, { teamId, userId }),
      listResolvedSince(db, { teamId, userId, since: sinceForResolved }),
      listMarketsForTeam(db, teamId),
    ]);

  async function rotateAction() {
    'use server';
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    await rotateInviteCode(db, { teamId, userId: session.user.id });
    revalidatePath(`/t/${teamId}`);
  }

  const origin = process.env.AUTH_URL ?? 'http://localhost:3333';
  const inviteUrl = `${origin}/join/${team.inviteCode}`;

  const filtered = marketRows.filter((m) => {
    if (activeTab === 'open') return m.status === 'open' || m.status === 'locked';
    if (activeTab === 'closed') return m.status === 'resolved' || m.status === 'voided';
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-dim font-semibold">Team</div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{team.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/me`}>My profile</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/activity`}>Activity</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/leaderboard`}>Leaderboard</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">Balance</div>
            <div className="text-2xl font-bold text-fg font-mono mt-0.5">🍩 {balance}</div>
            <div className="text-xs text-fg-muted mt-1">
              Spendable this week: <span className="text-accent font-semibold font-mono">🍩 {allowance}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">
              New market
            </div>
            <div className="mt-2">
              <Button asChild size="sm">
                <Link href={`/t/${teamId}/markets/new`}>New market</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {lockingSoon.length > 0 && (
        <DashboardSection title="Locking soon" hint="Place a stake before the window closes.">
          <ul className="divide-y divide-border" data-testid="locking-soon-list">
            {lockingSoon.map((row) => (
              <li key={row.market.id}>
                <MarketRow
                  variant="lockingSoon"
                  teamId={teamId}
                  market={row.market}
                  pools={row.pools}
                  yourStake={row.yourStake}
                />
              </li>
            ))}
          </ul>
        </DashboardSection>
      )}

      {openPositions.length > 0 && (
        <DashboardSection title="Your open positions">
          <ul className="divide-y divide-border" data-testid="your-positions-list">
            {openPositions.map((row) => (
              <li key={row.market.id}>
                <MarketRow
                  variant="position"
                  teamId={teamId}
                  market={row.market}
                  pools={row.pools}
                  yourStake={row.yourStake}
                />
              </li>
            ))}
          </ul>
        </DashboardSection>
      )}

      {resolvedAway.length > 0 && (
        <DashboardSection
          title="Resolved while you were away"
          hint={
            lastSeen.previous
              ? `Since your last visit on ${lastSeen.previous.toLocaleDateString()}.`
              : `In the last ${FIRST_VISIT_LOOKBACK_DAYS} days.`
          }
        >
          <ul className="divide-y divide-border" data-testid="resolved-away-list">
            {resolvedAway.map((row) => (
              <li key={row.market.id}>
                <MarketRow
                  variant="resolved"
                  teamId={teamId}
                  market={row.market}
                  yourDelta={row.yourDelta}
                />
              </li>
            ))}
          </ul>
        </DashboardSection>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between flex-wrap gap-2 p-4">
          <CardTitle className="text-sm">All markets</CardTitle>
          <details open className="text-xs">
            <summary className="cursor-pointer text-fg-dim hover:text-fg select-none">
              ▾ Invite link
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <code className="block break-all rounded-md bg-bg border border-border-strong px-2 py-1.5 text-[11px] font-mono text-fg-muted">
                {inviteUrl}
              </code>
              <form action={rotateAction}>
                <Button type="submit" variant="ghost" size="sm" className="text-accent hover:text-accent">
                  ↻ Rotate code
                </Button>
              </form>
            </div>
          </details>
        </CardHeader>
        <div className="flex gap-4 px-4 border-b border-border overflow-x-auto">
          {(['open', 'closed', 'all'] as const).map((t) => (
            <Link
              key={t}
              href={`/t/${teamId}?status=${t}`}
              className={`-mb-px border-b-2 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === t
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-dim hover:text-fg'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Link>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            title="No markets in this tab"
            description="Create the first one for your team."
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((m) => {
              const isClosed = m.status === 'resolved' || m.status === 'voided';
              return (
                <li key={m.id} className="px-4 py-3 hover:bg-surface-elevated transition-colors">
                  <Link
                    href={`/t/${teamId}/markets/${m.id}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-fg truncate">{m.title}</span>
                        {m.status === 'locked' && <StatusPill status="locked" />}
                        {isClosed && <StatusPill status={m.status} outcome={m.outcome ?? null} />}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
