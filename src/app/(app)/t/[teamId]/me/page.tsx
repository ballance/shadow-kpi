import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { eq } from 'drizzle-orm';
import { teams } from '@/server/db/schema';
import { getProfile } from '@/server/profile';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">You on {team.name}</h1>
        <Button asChild variant="outline">
          <Link href={`/t/${teamId}`}>Back to team</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Balance</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">🍩 {balance}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>This week</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">🍩 {allowance}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Win rate</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">
            {winRate === null ? '—' : `${winRate}%`}
            <div className="text-sm text-muted-foreground">
              {profile.winCount} of {profile.resolvedCount} resolved
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bet history ({profile.bets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.bets.length === 0 ? (
            <p className="text-muted-foreground">No bets yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {profile.bets.map(({ bet, market }) => (
                <li key={bet.id} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/t/${teamId}/markets/${market.id}`}
                    className="hover:underline"
                  >
                    {market.title}
                  </Link>
                  <span className="text-muted-foreground">
                    {bet.side.toUpperCase()} · 🍩 {bet.amount}
                    {market.status === 'resolved' && market.outcome && (
                      <>
                        {' '}
                        · {bet.side === market.outcome ? '✓ won' : '✗ lost'}
                      </>
                    )}
                    {market.status === 'voided' && <> · voided</>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
