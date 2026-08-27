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

function etOffsetMinutes(utc: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(utc).reduce<Record<string, string>>((a, p) => (a[p.type] = p.value, a), {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUTC - utc.getTime()) / 60000;
}

/** UTC instant for an ET wall-clock time (hh:mm) on the given ET date (YYYY-MM-DD). */
export function etTimestamp(dateStr: string, hh: number, mm: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const off = etOffsetMinutes(guess);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0) - off * 60000);
}

/** ET calendar date (YYYY-MM-DD) for a UTC instant. */
export function etDateString(utc: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(utc);
}
