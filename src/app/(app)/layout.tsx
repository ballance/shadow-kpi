import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth, signOut } from '@/server/auth';
import { db } from '@/server/db/client';
import { listNotifications, getUnreadCount } from '@/server/notifications';
import { NotificationBell } from '@/components/notification-bell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/signin');

  const [unreadCount, recent] = await Promise.all([
    getUnreadCount(db, session.user.id),
    listNotifications(db, session.user.id, 20),
  ]);

  const items = recent.map((n) => ({
    id: n.id,
    kind: n.kind,
    marketId: n.marketId,
    marketTeamId: n.marketTeamId,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  }));

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <Link href="/teams" className="font-semibold">
            shadow-kpi
          </Link>
          <div className="flex items-center gap-4">
            <NotificationBell unreadCount={unreadCount} notifications={items} />
            <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }); }}>
              <button type="submit" className="text-sm text-muted-foreground hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>
    </div>
  );
}
