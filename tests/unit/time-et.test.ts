import { describe, it, expect } from 'vitest';
import { etTimestamp, etDateString } from '@/server/time';

describe('etTimestamp', () => {
  it('maps noon EDT (summer) to 16:00 UTC', () => {
    expect(etTimestamp('2026-07-01', 12, 0).toISOString()).toBe('2026-07-01T16:00:00.000Z');
  });
  it('maps noon EST (winter) to 17:00 UTC', () => {
    expect(etTimestamp('2026-01-05', 12, 0).toISOString()).toBe('2026-01-05T17:00:00.000Z');
  });
  it('maps 16:15 EDT to 20:15 UTC', () => {
    expect(etTimestamp('2026-07-01', 16, 15).toISOString()).toBe('2026-07-01T20:15:00.000Z');
  });
});
describe('etDateString', () => {
  it('returns the ET calendar date for a UTC instant near midnight', () => {
    expect(etDateString(new Date('2026-07-02T02:00:00Z'))).toBe('2026-07-01');
  });
});
