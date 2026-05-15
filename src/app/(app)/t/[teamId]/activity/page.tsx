import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { eq } from 'drizzle-orm';
import { teams } from '@/server/db/schema';
import { getTeamActivityFeed, type ActivityItem } from '@/server/activity';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';

interface ActivityPageProps {
  params: Promise<{ teamId: string }>;
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function iconFor(item: ActivityItem): string {
  switch (item.kind) {
    case 'market_created': return '📈';
    case 'market_resolved': return item.outcome === 'yes' ? '✅' : '❌';
    case 'comment_posted': return '💬';
  }
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
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-dim font-semibold">Activity</div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{team.name}</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}`}>← Back to team</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No activity yet" description="Create a market or comment to see things show up here." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {items.map((item, i) => (
              <li key={`${item.kind}-${item.marketId}-${i}`}>
                <Link
                  href={`/t/${teamId}/markets/${item.marketId}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors"
                >
                  <span className="text-lg" aria-hidden>{iconFor(item)}</span>
                  <span className="flex-1 text-sm text-fg truncate">{describeItem(item)}</span>
                  <span className="text-[10px] text-fg-dim whitespace-nowrap">
                    {item.at.toISOString().slice(0, 16).replace('T', ' ')} UTC
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
