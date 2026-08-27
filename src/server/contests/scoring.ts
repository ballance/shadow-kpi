export type GuessInput = { userId: string; guessCents: number; createdAt: Date };
export type Winner = {
  userId: string; place: number; prizeCoins: number; guessCents: number; diffCents: number;
};
/** Closest guess wins; ties broken by earliest submission. Pure. */
export function rankGuesses(guesses: GuessInput[], actualCloseCents: number, prizeTiers: number[]): Winner[] {
  const ranked = [...guesses].sort((a, b) => {
    const da = Math.abs(a.guessCents - actualCloseCents);
    const db = Math.abs(b.guessCents - actualCloseCents);
    if (da !== db) return da - db;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const n = Math.min(prizeTiers.length, ranked.length);
  return ranked.slice(0, n).map((g, i) => ({
    userId: g.userId, place: i + 1, prizeCoins: prizeTiers[i],
    guessCents: g.guessCents, diffCents: Math.abs(g.guessCents - actualCloseCents),
  }));
}
