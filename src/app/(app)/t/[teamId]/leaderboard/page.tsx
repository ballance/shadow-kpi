import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { eq } from 'drizzle-orm';
import { teams } from '@/server/db/schema';
import { getTeamLeaderboard } from '@/server/teams';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';

interface LeaderboardPageProps {
  params: Promise<{ teamId: string }>;
}

function rankPrefix(i: number): string {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `${i + 1}.`;
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-dim font-semibold">Leaderboard</div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{team.name}</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}`}>← Back to team</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nobody on the board yet" description="The leaderboard fills in as members resolve markets." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((row, i) => (
              <li key={row.userId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-mono text-fg-dim w-8 shrink-0">{rankPrefix(i)}</span>
                  <span className="text-sm text-fg truncate">{nameFromEmail(row.email)}</span>
                </div>
                <span className="text-sm font-mono font-semibold text-fg whitespace-nowrap">
                  🍩 {row.balance}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
