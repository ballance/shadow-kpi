export interface OddsBarProps {
  yesShare: number;
  noShare: number;
  yesPool: number;
  noPool: number;
  total: number;
}

const YES_GRADIENT = 'linear-gradient(90deg, #0f766e, #14b8a6)';
const NO_GRADIENT = 'linear-gradient(90deg, #9f1239, #f43f5e)';

export function OddsBar({ yesShare, noShare, yesPool, noPool, total }: OddsBarProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex justify-between text-xs text-fg-muted mb-2">
        <span>Pool</span>
        <span className="text-fg font-bold">🍩 {total}</span>
      </div>
      {total === 0 ? (
        <div className="h-9 rounded-md bg-border flex items-center justify-center text-fg-muted text-xs">
          No bets yet
        </div>
      ) : (
        <>
          <div className="h-9 rounded-md overflow-hidden flex">
            {yesShare > 0 && (
              <div
                className="min-w-0 overflow-hidden flex items-center justify-center text-xs font-bold"
                style={{
                  width: `${yesShare * 100}%`,
                  background: YES_GRADIENT,
                  color: '#062f2a',
                }}
              >
                YES · {Math.round(yesShare * 100)}%
              </div>
            )}
            {noShare > 0 && (
              <div
                className="min-w-0 overflow-hidden flex items-center justify-center text-xs font-bold"
                style={{
                  width: `${noShare * 100}%`,
                  background: NO_GRADIENT,
                  color: '#2a0e16',
                }}
              >
                NO · {Math.round(noShare * 100)}%
              </div>
            )}
          </div>
          <div className="flex justify-between text-[10px] text-fg-dim mt-1.5">
            <span>🍩 {yesPool} YES</span>
            <span>🍩 {noPool} NO</span>
          </div>
        </>
      )}
    </div>
  );
}
