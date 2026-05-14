import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { eq } from 'drizzle-orm';
import { teams } from '@/server/db/schema';
import { getTeamActivityFeed, type ActivityItem } from '@/server/activity';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ActivityPageProps {
  params: Promise<{ teamId: string }>;
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function describeItem(item: ActivityItem): string {
  switch (item.kind) {
    case 'market_created':
      return `New market: ${item.title}`;
    case 'market_resolved':
      return `Resolved ${item.outcome.toUpperCase()}: ${item.title}`;
    case 'comment_posted':
      return `${nameFromEmail(item.commenterEmail)} commented on ${item.title}`;
  }
}

export default async function ActivityPage({ params }: ActivityPageProps) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const items = await getTeamActivityFeed(db, teamId, 50);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Activity — {team.name}</h1>
        <Button asChild variant="outline">
          <Link href={`/t/${teamId}`}>Back to team</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="py-6">
          {items.length === 0 ? (
            <p className="text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item, i) => (
                <li
                  key={`${item.kind}-${item.marketId}-${i}`}
                  className="flex items-center justify-between"
                >
                  <Link
                    href={`/t/${teamId}/markets/${item.marketId}`}
                    className="hover:underline"
                  >
                    {describeItem(item)}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {item.at.toISOString().slice(0, 16).replace('T', ' ')} UTC
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
