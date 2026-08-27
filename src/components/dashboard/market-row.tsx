import * as React from 'react';
import Link from 'next/link';
import type { Market } from '@/server/db/schema';
import { OddsBar } from '@/components/odds-bar';
import { LockCountdown } from '@/components/dashboard/lock-countdown';

type Stake = { side: 'yes' | 'no'; amount: number };

interface LockingSoonRowProps {
  variant: 'lockingSoon';
  teamId: string;
  market: Market;
  pools: { yes: number; no: number };
  yourStake: Stake | null;
}

interface PositionRowProps {
  variant: 'position';
  teamId: string;
  market: Market;
  pools: { yes: number; no: number };
  yourStake: Stake;
}

interface ResolvedRowProps {
  variant: 'resolved';
  teamId: string;
  market: Market;
  yourDelta: number;
}

export type MarketRowProps = LockingSoonRowProps | PositionRowProps | ResolvedRowProps;

export function MarketRow(props: MarketRowProps) {
  const href = `/t/${props.teamId}/markets/${props.market.id}`;

  if (props.variant === 'lockingSoon') {
    const total = props.pools.yes + props.pools.no;
    const yesShare = total > 0 ? props.pools.yes / total : 0;
    const noShare = total > 0 ? props.pools.no / total : 0;
    return (
      <Link
        href={href}
        className="flex items-center gap-4 px-4 py-3 hover:bg-surface-elevated transition-colors"
      >
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-fg truncate">{props.market.title}</span>
            <LockCountdown lockupAt={props.market.lockupAt} />
          </div>
          <OddsBar
            yesPool={props.pools.yes}
            noPool={props.pools.no}
            yesShare={yesShare}
            noShare={noShare}
            total={total}
          />
        </div>
        <div className="flex flex-col items-end gap-0.5 text-xs">
          <span className="font-mono text-fg-muted">🪙 {total}</span>
          {props.yourStake ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">
              your {props.yourStake.side} 🪙 {props.yourStake.amount}
            </span>
          ) : null}
        </div>
      </Link>
    );
  }

  if (props.variant === 'position') {
    const total = props.pools.yes + props.pools.no;
    return (
      <Link
        href={href}
        className="flex items-center gap-4 px-4 py-3 hover:bg-surface-elevated transition-colors"
      >
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-fg truncate">{props.market.title}</span>
            <LockCountdown lockupAt={props.market.lockupAt} />
          </div>
          <span className="text-[10px] uppercase tracking-wide font-semibold text-fg-dim">
            your {props.yourStake.side} · 🪙 {props.yourStake.amount}
          </span>
        </div>
        <span className="text-xs font-mono text-fg-muted">pool 🪙 {total}</span>
      </Link>
    );
  }

  const outcomeChip = (() => {
    if (props.market.status === 'voided') {
      return (
        <span className="rounded-md bg-bg border border-border-strong px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          voided
        </span>
      );
    }
    if (props.market.outcome === 'yes') {
      return (
        <span className="rounded-md bg-accent-bg border border-accent-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
          yes
        </span>
      );
    }
    return (
      <span className="rounded-md bg-danger-bg border border-danger-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
        no
      </span>
    );
  })();

  const deltaLabel = (() => {
    if (props.market.status === 'voided') return 'refund';
    if (props.yourDelta > 0) return `+🪙 ${props.yourDelta}`;
    if (props.yourDelta < 0) return `−🪙 ${Math.abs(props.yourDelta)}`;
    return '🪙 0';
  })();

  const deltaClass =
    props.market.status === 'voided'
      ? 'text-fg-muted'
      : props.yourDelta > 0
        ? 'text-accent'
        : props.yourDelta < 0
          ? 'text-danger'
          : 'text-fg-muted';

  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-4 py-3 hover:bg-surface-elevated transition-colors"
    >
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-fg truncate">{props.market.title}</span>
        {outcomeChip}
      </div>
      <span className={`text-xs font-mono font-semibold ${deltaClass}`}>{deltaLabel}</span>
    </Link>
  );
}
