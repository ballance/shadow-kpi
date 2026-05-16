export const LAST_SEEN_STALE_MS = 30 * 60_000;

export function shouldAdvanceLastSeen(
  previous: Date | null,
  now: Date,
  staleMs: number = LAST_SEEN_STALE_MS,
): boolean {
  if (previous === null) return true;
  return now.getTime() - previous.getTime() > staleMs;
}
