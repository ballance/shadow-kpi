import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { eq } from 'drizzle-orm';
import { teams } from '@/server/db/schema';
import { getTeamLeaderboard } from '@/server/teams';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LeaderboardPageProps {
  params: Promise<{ teamId: string }>;
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function LeaderboardPage({ params }: LeaderboardPageProps) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const rows = await getTeamLeaderboard(db, teamId);
  const myId = session.user.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Leaderboard — {team.name}</h1>
        <Button asChild variant="outline">
          <Link href={`/t/${teamId}`}>Back to team</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total doughnuts held</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground">No members yet.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <li
                  key={r.userId}
                  className={`flex items-center justify-between ${
                    r.userId === myId ? 'font-semibold' : ''
                  }`}
                >
                  <span>
                    <span className="text-muted-foreground">{i + 1}.</span>{' '}
                    {nameFromEmail(r.email)}
                    {r.userId === myId && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </span>
                  <span>🍩 {r.balance}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
