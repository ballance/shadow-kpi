import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { eq } from 'drizzle-orm';
import { teams } from '@/server/db/schema';
import { getProfile } from '@/server/profile';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';

interface MePageProps {
  params: Promise<{ teamId: string }>;
}

export default async function MePage({ params }: MePageProps) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const [profile, balance, allowance] = await Promise.all([
    getProfile(db, { userId: session.user.id, teamId }),
    getBalance(db, { userId: session.user.id, teamId }),
    getSpendableAllowance(db, { userId: session.user.id, teamId }),
  ]);

  const winRate =
    profile.resolvedCount === 0
      ? null
      : Math.round((profile.winCount / profile.resolvedCount) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">You on {team.name}</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}`}>← Back to team</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">Balance</div>
            <div className="text-2xl font-bold text-fg font-mono mt-0.5">🍩 {balance}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">This week</div>
            <div className="text-2xl font-bold text-fg font-mono mt-0.5">🍩 {allowance}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">Win rate</div>
            <div className="text-2xl font-bold text-fg font-mono mt-0.5">
              {winRate === null ? '—' : `${winRate}%`}
            </div>
            <div className="text-[10px] text-fg-dim mt-0.5">
              {profile.winCount} of {profile.resolvedCount} resolved
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-[11px] uppercase tracking-wide font-semibold">
            Bet history ({profile.bets.length})
          </CardTitle>
        </CardHeader>
        {profile.bets.length === 0 ? (
          <EmptyState title="No bets yet" description="Place one to start filling this in." />
        ) : (
          <ul className="divide-y divide-border">
            {profile.bets.map(({ bet, market }) => {
              const won = market.status === 'resolved' && market.outcome === bet.side;
              const lost = market.status === 'resolved' && market.outcome && market.outcome !== bet.side;
              const voided = market.status === 'voided';
              return (
                <li key={bet.id}>
                  <Link
                    href={`/t/${teamId}/markets/${market.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors"
                  >
                    <span className="text-sm text-fg truncate flex-1">{market.title}</span>
                    <span className="flex items-center gap-2 whitespace-nowrap text-xs">
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase border ${
                          bet.side === 'yes'
                            ? 'bg-accent-bg text-accent border-accent-border'
                            : 'bg-danger-bg text-danger border-danger-border'
                        }`}
                      >
                        {bet.side}
                      </span>
                      <span className="font-mono text-fg">🍩 {bet.amount}</span>
                      {won && <span className="text-accent font-semibold">✓ won</span>}
                      {lost && <span className="text-danger font-semibold">✗ lost</span>}
                      {voided && <span className="text-fg-dim">voided</span>}
                    </span>
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
