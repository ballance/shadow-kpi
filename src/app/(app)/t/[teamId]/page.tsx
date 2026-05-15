import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { rotateInviteCode } from '@/server/teams';
import { listMarketsForTeam } from '@/server/markets';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/status-pill';
import { EmptyState } from '@/components/empty-state';

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function TeamDashboardPage({ params, searchParams }: TeamPageProps) {
  const { teamId } = await params;
  const { status } = await searchParams;
  const activeTab: 'open' | 'closed' | 'all' =
    status === 'closed' || status === 'all' ? status : 'open';
  const session = await auth();
  if (!session?.user) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const [balance, allowance, marketRows] = await Promise.all([
    getBalance(db, { userId: session.user.id, teamId }),
    getSpendableAllowance(db, { userId: session.user.id, teamId }),
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
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">Invite link</div>
            <code className="block mt-2 break-all rounded-md bg-bg border border-border-strong px-2 py-1.5 text-[11px] font-mono text-fg-muted">
              {inviteUrl}
            </code>
            <form action={rotateAction} className="mt-2">
              <Button type="submit" variant="ghost" size="sm" className="text-accent hover:text-accent">
                ↻ Rotate code
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between flex-wrap gap-2 p-4">
          <CardTitle>Markets</CardTitle>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/t/${teamId}/activity`}>Activity</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/t/${teamId}/markets/new`}>New market</Link>
            </Button>
          </div>
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
