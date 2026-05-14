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

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ status?: string }>;
}

function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{team.name}</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/t/${teamId}/me`}>My profile</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/t/${teamId}/leaderboard`}>Leaderboard</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">🍩 {balance}</div>
            <div className="text-sm text-muted-foreground">
              Spendable this week: 🍩 {allowance}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invite link</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <code className="block break-all rounded-md bg-muted px-3 py-2 text-sm">
              {inviteUrl}
            </code>
            <form action={rotateAction}>
              <Button type="submit" variant="outline">
                Rotate code
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
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
        <CardContent className="flex flex-col gap-4">
          <nav className="flex gap-2 border-b">
            {(['open', 'closed', 'all'] as const).map((t) => (
              <Link
                key={t}
                href={`/t/${teamId}?status=${t}`}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  activeTab === t
                    ? 'border-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Link>
            ))}
          </nav>
          {(() => {
            const filtered = marketRows.filter((m) => {
              if (activeTab === 'open') return m.status === 'open' || m.status === 'locked';
              if (activeTab === 'closed') return m.status === 'resolved' || m.status === 'voided';
              return true;
            });
            if (filtered.length === 0) {
              return <p className="text-muted-foreground">No markets in this tab.</p>;
            }
            return (
              <ul className="flex flex-col gap-2">
                {filtered.map((m) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <Link
                      href={`/t/${teamId}/markets/${m.id}`}
                      className="hover:underline"
                    >
                      {m.title}
                    </Link>
                    <span className="text-sm text-muted-foreground">
                      {statusLabel(m.status)}
                      {m.outcome && ` · ${m.outcome.toUpperCase()}`}
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
