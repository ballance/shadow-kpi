'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

interface NotificationItem {
  id: string;
  kind: string;
  marketId: string | null;
  marketTeamId: string | null;
  createdAt: string;
  readAt: string | null;
}

interface NotificationBellProps {
  unreadCount: number;
  notifications: NotificationItem[];
}

function describe(kind: string): string {
  switch (kind) {
    case 'market_created':
      return 'New market';
    case 'market_locked':
      return 'Market locked';
    case 'market_resolved':
      return 'Market resolved';
    case 'market_voided':
      return 'Market voided';
    case 'comment_posted':
      return 'New comment';
    default:
      return kind;
  }
}

export function NotificationBell({
  unreadCount,
  notifications,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const pathTeamId = pathname.match(/^\/t\/([^/]+)/)?.[1] ?? null;

  async function handleOpen() {
    setOpen(!open);
    if (!open && unreadCount > 0) {
      startTransition(async () => {
        await fetch('/api/notifications/mark-read', { method: 'POST' });
        router.refresh();
      });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="relative inline-flex items-center px-2 py-1 text-sm hover:underline"
        aria-label={`${unreadCount} unread notifications`}
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border bg-white p-2 shadow-lg dark:bg-slate-950">
          {notifications.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-500">No notifications yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {notifications.map((n) => {
                const linkTeamId = n.marketTeamId ?? pathTeamId;
                const href =
                  n.marketId && linkTeamId
                    ? `/t/${linkTeamId}/markets/${n.marketId}`
                    : linkTeamId
                      ? `/t/${linkTeamId}`
                      : '/teams';
                return (
                  <li key={n.id}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className={`block rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        n.readAt ? 'text-slate-500' : ''
                      }`}
                    >
                      {describe(n.kind)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
