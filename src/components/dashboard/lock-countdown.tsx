'use client';

import * as React from 'react';
import { formatLockDistance } from '@/server/time';

interface LockCountdownProps {
  lockupAt: Date | string;
}

export function LockCountdown({ lockupAt }: LockCountdownProps) {
  const target = React.useMemo(
    () => (typeof lockupAt === 'string' ? new Date(lockupAt) : lockupAt),
    [lockupAt],
  );
  const [label, setLabel] = React.useState(() => formatLockDistance(target, new Date()));

  React.useEffect(() => {
    const id = setInterval(() => {
      setLabel(formatLockDistance(target, new Date()));
    }, 30_000);
    return () => clearInterval(id);
  }, [target]);

  if (label === 'locked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
        locked
      </span>
    );
  }

  return (
    <span className="text-xs font-mono text-fg-muted whitespace-nowrap" suppressHydrationWarning>
      {label}
    </span>
  );
}
