import { redirect } from 'next/navigation';
import { auth, signOut } from '@/server/auth';
import { db } from '@/server/db/client';
import { listNotifications, getUnreadCount } from '@/server/notifications';
import { NavBar } from '@/components/nav-bar';

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
      <NavBar
        homeHref="/teams"
        notifications={{ unreadCount, notifications: items }}
      />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6">
        <div className="flex justify-end pb-2">
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }); }}>
            <button type="submit" className="text-sm text-fg-dim hover:text-fg hover:underline transition-colors">
              Sign out
            </button>
          </form>
        </div>
        {children}
      </div>
    </div>
  );
}
