let frozenNow: Date | null = null;

export function now(): Date {
  return frozenNow ?? new Date();
}

export function __setNowForTests(d: Date | null): void {
  frozenNow = d;
}

export function formatLockDistance(lockupAt: Date, reference: Date = now()): string {
  const deltaMs = lockupAt.getTime() - reference.getTime();
  if (deltaMs <= 0) return 'locked';
  const totalMinutes = Math.floor(deltaMs / 60_000);
  if (totalMinutes < 1) return 'locks in <1m';
  if (totalMinutes < 60) return `locks in ${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes - totalHours * 60;
    return minutes === 0
      ? `locks in ${totalHours}h`
      : `locks in ${totalHours}h ${minutes}m`;
  }
  const days = Math.floor(totalHours / 24);
  return `locks in ${days}d`;
}
