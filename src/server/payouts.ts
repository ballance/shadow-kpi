export interface BetInput {
  id: string;
  side: 'yes' | 'no';
  amount: number;
  placedAt: Date;
}

export interface PayoutOutput {
  betId: string;
  payout: number;
}

export interface PayoutResult {
  payouts: PayoutOutput[];
  vaporized: number;
}

export function computePayouts(
  bets: readonly BetInput[],
  outcome: 'yes' | 'no',
): PayoutResult {
  const winners = bets.filter((b) => b.side === outcome);
  const losers = bets.filter((b) => b.side !== outcome);

  if (bets.length === 0) {
    return { payouts: [], vaporized: 0 };
  }

  const winningPool = winners.reduce((s, b) => s + b.amount, 0);
  const losingPool = losers.reduce((s, b) => s + b.amount, 0);

  if (winners.length === 0) {
    return { payouts: [], vaporized: losingPool };
  }

  const payouts: PayoutOutput[] = winners.map((b) => {
    const profit = winningPool === 0 ? 0 : Math.floor((b.amount * losingPool) / winningPool);
    return { betId: b.id, payout: b.amount + profit };
  });

  const distributedProfit = payouts.reduce((s, p) => {
    const winner = winners.find((w) => w.id === p.betId);
    if (!winner) return s;
    return s + (p.payout - winner.amount);
  }, 0);
  const dust = losingPool - distributedProfit;

  if (dust > 0) {
    const sortedWinners = [...winners].sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.placedAt.getTime() - b.placedAt.getTime();
    });
    const luckyId = sortedWinners[0].id;
    const lucky = payouts.find((p) => p.betId === luckyId);
    if (lucky) lucky.payout += dust;
  }

  return { payouts, vaporized: 0 };
}
