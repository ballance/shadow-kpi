import { describe, it, expect } from 'vitest';
import { formatLockDistance } from '@/server/time';

describe('formatLockDistance', () => {
  const now = new Date('2026-05-15T12:00:00Z');

  it('returns "locked" when lockup is in the past', () => {
    expect(formatLockDistance(new Date('2026-05-15T11:59:59Z'), now)).toBe('locked');
  });

  it('returns "locks in <Nm" for sub-minute distances', () => {
    expect(formatLockDistance(new Date('2026-05-15T12:00:30Z'), now)).toBe('locks in <1m');
  });

  it('returns minutes only when under an hour', () => {
    expect(formatLockDistance(new Date('2026-05-15T12:14:00Z'), now)).toBe('locks in 14m');
  });

  it('returns Hh Mm when under a day', () => {
    expect(formatLockDistance(new Date('2026-05-15T14:30:00Z'), now)).toBe('locks in 2h 30m');
  });

  it('returns Hh when minutes are zero and under a day', () => {
    expect(formatLockDistance(new Date('2026-05-15T15:00:00Z'), now)).toBe('locks in 3h');
  });

  it('returns Nd when one day or more', () => {
    expect(formatLockDistance(new Date('2026-05-17T12:00:00Z'), now)).toBe('locks in 2d');
  });

  it('returns "locks in 1d" at exactly 24h', () => {
    expect(formatLockDistance(new Date('2026-05-16T12:00:00Z'), now)).toBe('locks in 1d');
  });
});
