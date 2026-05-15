import Link from 'next/link';
import { NotificationBell, type NotificationBellProps } from '@/components/notification-bell';
import { BalanceChip } from '@/components/balance-chip';

export interface NavBarProps {
  homeHref: string;
  notifications: NotificationBellProps;
  balance?: { balance: number; spendableThisWeek: number };
}

export function NavBar({ homeHref, notifications, balance }: NavBarProps) {
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto max-w-4xl h-full px-4 sm:px-6 flex items-center justify-between">
        <Link
          href={homeHref}
          className="font-mono text-sm font-bold tracking-tight text-fg hover:text-accent transition-colors"
        >
          shadow-kpi
        </Link>
        <div className="flex items-center gap-3">
          <NotificationBell {...notifications} />
          {balance && <BalanceChip {...balance} />}
        </div>
      </div>
    </header>
  );
}
