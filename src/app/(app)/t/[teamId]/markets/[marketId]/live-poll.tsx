'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface LivePollProps {
  enabled: boolean;
  intervalMs?: number;
}

export function LivePoll({ enabled, intervalMs = 5000 }: LivePollProps) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, router]);
  return null;
}
