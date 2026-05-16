import { describe, it, expect } from 'vitest';
import { shouldAdvanceLastSeen } from '@/server/dashboard';

describe('shouldAdvanceLastSeen', () => {
  const now = new Date('2026-05-15T12:00:00Z');

  it('returns true when previous is null (first visit)', () => {
    expect(shouldAdvanceLastSeen(null, now)).toBe(true);
  });

  it('returns false when previous is younger than 30 minutes', () => {
    const recent = new Date('2026-05-15T11:45:00Z');
    expect(shouldAdvanceLastSeen(recent, now)).toBe(false);
  });

  it('returns false at exactly 30 minutes (boundary uses strict >)', () => {
    const exactly = new Date('2026-05-15T11:30:00Z');
    expect(shouldAdvanceLastSeen(exactly, now)).toBe(false);
  });

  it('returns true when previous is older than 30 minutes', () => {
    const stale = new Date('2026-05-15T11:29:00Z');
    expect(shouldAdvanceLastSeen(stale, now)).toBe(true);
  });

  it('respects a custom staleMs threshold', () => {
    const recent = new Date('2026-05-15T11:45:00Z');
    expect(shouldAdvanceLastSeen(recent, now, 10 * 60_000)).toBe(true);
  });
});
