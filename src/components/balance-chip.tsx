export interface BalanceChipProps {
  balance: number;
  spendableThisWeek: number;
}

export function BalanceChip({ balance, spendableThisWeek }: BalanceChipProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill bg-surface border border-border-strong px-3 h-8 text-sm font-semibold text-fg"
      title={`Spendable this week: 🍩 ${spendableThisWeek}`}
    >
      <span aria-hidden>🍩</span>
      <span>{balance}</span>
    </span>
  );
}
