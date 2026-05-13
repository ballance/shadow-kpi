import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { rotateInviteCode } from '@/server/teams';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function TeamDashboardPage({ params }: TeamPageProps) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const [balance, allowance] = await Promise.all([
    getBalance(db, { userId: session.user.id, teamId }),
    getSpendableAllowance(db, { userId: session.user.id, teamId }),
  ]);

  async function rotateAction() {
    'use server';
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    await rotateInviteCode(db, { teamId, userId: session.user.id });
    revalidatePath(`/t/${teamId}`);
  }

  const origin = process.env.AUTH_URL ?? 'http://localhost:3000';
  const inviteUrl = `${origin}/join/${team.inviteCode}`;

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
        <CardHeader>
          <CardTitle>Markets</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Markets are coming in the next release.
        </CardContent>
      </Card>
    </div>
  );
}
