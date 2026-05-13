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
}

function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function TeamDashboardPage({ params }: TeamPageProps) {
  const { teamId } = await params;
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

  const origin = process.env.AUTH_URL ?? 'http://localhost:3000';
  const inviteUrl = `${origin}/join/${team.inviteCode}`;

  const openMarkets = marketRows.filter((m) => m.status === 'open' || m.status === 'locked');
  const closedMarkets = marketRows.filter((m) => m.status === 'resolved' || m.status === 'voided');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">{team.name}</h1>

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
          <CardTitle>Open markets</CardTitle>
          <Button asChild>
            <Link href={`/t/${teamId}/markets/new`}>New market</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {openMarkets.length === 0 ? (
            <p className="text-muted-foreground">No open markets. Create the first one.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {openMarkets.map((m) => (
                <li key={m.id} className="flex items-center justify-between">
                  <Link
                    href={`/t/${teamId}/markets/${m.id}`}
                    className="hover:underline"
                  >
                    {m.title}
                  </Link>
                  <span className="text-sm text-muted-foreground">{statusLabel(m.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {closedMarkets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Closed markets</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {closedMarkets.map((m) => (
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
