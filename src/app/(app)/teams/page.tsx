import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { listMembershipsForUser } from '@/server/teams';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';

export default async function TeamsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const memberships = await listMembershipsForUser(db, session.user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-dim font-semibold">Your teams</div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Pick a team</h1>
        </div>
        <Button asChild>
          <Link href="/teams/new">Create team</Link>
        </Button>
      </div>

      {memberships.length === 0 ? (
        <EmptyState
          title="You aren't on any teams yet."
          description="Create one above, or join one via an invite link."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {memberships.map(({ team, balance }) => (
            <Link key={team.id} href={`/t/${team.id}`}>
              <Card className="hover:bg-surface-elevated transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle>{team.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between py-3">
                  <span className="text-sm text-fg-muted">🍩 {balance}</span>
                  <span className="text-xs text-fg-dim">Open →</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
