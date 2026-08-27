import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { NotificationBell, type NotificationBellProps } from '@/components/notification-bell';
import { BalanceChip } from '@/components/balance-chip';

export interface NavBarProps {
  homeHref: string;
  notifications: NotificationBellProps;
  balance?: { balance: number; spendableThisWeek: number };
  rightExtras?: React.ReactNode;
}

export function NavBar({ homeHref, notifications, balance, rightExtras }: NavBarProps) {
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto max-w-4xl h-full px-4 sm:px-6 flex items-center justify-between">
        <Link
          href={homeHref}
          aria-label="OptionsPlayers"
          className="flex items-center hover:opacity-80 transition-opacity"
        >
          {/* dark linework on light theme, gold foil on dark theme */}
          <Image
            src="/op-wings-dark.png"
            alt="OptionsPlayers"
            width={160}
            height={40}
            priority
            className="h-8 w-auto dark:hidden"
          />
          <Image
            src="/op-wings.png"
            alt=""
            aria-hidden
            width={160}
            height={40}
            priority
            className="hidden h-8 w-auto dark:block"
          />
        </Link>
        <div className="flex items-center gap-3">
          <NotificationBell {...notifications} />
          {balance && <BalanceChip {...balance} />}
          {rightExtras}
        </div>
      </div>
    </header>
  );
}
