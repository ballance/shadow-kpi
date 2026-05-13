import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { listMembershipsForUser } from '@/server/teams';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function TeamsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const memberships = await listMembershipsForUser(db, session.user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your teams</h1>
        <Button asChild>
          <Link href="/teams/new">Create team</Link>
        </Button>
      </div>

      {memberships.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You aren't on any teams yet. Create one above, or join one via an invite link.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {memberships.map(({ team, balance }) => (
            <Card key={team.id}>
              <CardHeader>
                <CardTitle>{team.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-2xl">🍩 {balance}</span>
                <Button asChild variant="outline">
                  <Link href={`/t/${team.id}`}>Open</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
