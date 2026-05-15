import { cn } from '@/lib/utils';

export interface YesNoChipProps {
  yesShare: number;
  noShare: number;
  className?: string;
}

function formatCents(share: number): string {
  return `${Math.round(share * 100)}¢`;
}

export function YesNoChip({ yesShare, noShare, className }: YesNoChipProps) {
  const yesActive = yesShare > 0;
  const noActive = noShare > 0;
  return (
    <div className={cn('flex gap-1', className)}>
      <span
        className={cn(
          'rounded-sm px-2 py-1 text-xs font-bold border',
          yesActive
            ? 'bg-accent-bg text-accent border-accent-border'
            : 'bg-surface text-fg-muted border-border-strong',
        )}
      >
        YES {formatCents(yesShare)}
      </span>
      <span
        className={cn(
          'rounded-sm px-2 py-1 text-xs font-bold border',
          noActive
            ? 'bg-danger-bg text-danger border-danger-border'
            : 'bg-surface text-fg-muted border-border-strong',
        )}
      >
        NO {formatCents(noShare)}
      </span>
    </div>
  );
}
