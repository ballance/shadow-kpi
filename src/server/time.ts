let frozenNow: Date | null = null;

export function now(): Date {
  return frozenNow ?? new Date();
}

export function __setNowForTests(d: Date | null): void {
  frozenNow = d;
}
