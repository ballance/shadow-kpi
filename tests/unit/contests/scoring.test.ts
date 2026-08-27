import { describe, it, expect } from 'vitest';
import { rankGuesses } from '@/server/contests/scoring';
const d = (s: string) => new Date(s);
describe('rankGuesses', () => {
  const tiers = [25, 15, 10];
  it('ranks by absolute distance to the close', () => {
    const w = rankGuesses([
      { userId: 'a', guessCents: 31722, createdAt: d('2026-08-19T10:00:00Z') },
      { userId: 'b', guessCents: 31736, createdAt: d('2026-08-19T10:01:00Z') },
      { userId: 'c', guessCents: 31620, createdAt: d('2026-08-19T10:02:00Z') },
    ], 31683, tiers);
    expect(w.map((x) => x.userId)).toEqual(['a', 'b', 'c']);
    expect(w.map((x) => x.prizeCoins)).toEqual([25, 15, 10]);
    expect(w[0].place).toBe(1);
  });
  it('breaks ties by earliest submission', () => {
    const w = rankGuesses([
      { userId: 'late', guessCents: 10011, createdAt: d('2026-08-18T12:00:00Z') },
      { userId: 'early', guessCents: 10009, createdAt: d('2026-08-18T09:00:00Z') },
    ], 10010, tiers);
    expect(w[0].userId).toBe('early');
  });
  it('awards only as many places as there are players', () => {
    const w = rankGuesses([{ userId: 'a', guessCents: 100, createdAt: d('2026-08-18T09:00:00Z') }], 105, tiers);
    expect(w).toHaveLength(1);
    expect(w[0].prizeCoins).toBe(25);
  });
  it('returns empty when there are no guesses', () => {
    expect(rankGuesses([], 105, tiers)).toEqual([]);
  });
});
