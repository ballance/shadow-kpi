import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LockCountdown } from '@/components/dashboard/lock-countdown';
import type { CurrentContest } from '@/server/contests/contests';

interface CurrentContestCardProps {
  data: CurrentContest;
  action: (formData: FormData) => void | Promise<void>;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

function ordinal(i: number): string {
  return ORDINALS[i] ?? `${i + 1}th`;
}

export function CurrentContestCard({ data, action }: CurrentContestCardProps) {
  const { contest, myGuessCents, submissionsClosed } = data;
  const prizeTiers: number[] = JSON.parse(contest.prizeTiers);
  const myGuessDollars = myGuessCents != null ? (myGuessCents / 100).toFixed(2) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          🏆 {contest.symbol} · {contest.contestDate}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-1 text-xs text-fg-muted">
          <span>Submissions close in</span>
          <LockCountdown lockupAt={contest.submissionsCloseAt} />
        </div>

        <div className="text-xs text-fg-muted">
          Prizes: {prizeTiers.map((coins, i) => `${ordinal(i)} place: ${coins} coins`).join(' · ')}
        </div>

        {myGuessDollars !== undefined && (
          <div className="text-sm text-fg">
            Your current guess: <span className="font-mono font-semibold">${myGuessDollars}</span>.
            You can update it until submissions close.
          </div>
        )}

        {submissionsClosed ? (
          <div className="text-sm text-fg-muted">Submissions closed — awaiting result.</div>
        ) : (
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="contestId" value={contest.id} />
            <Label htmlFor="guess">
              Enter your guess for {contest.symbol}&apos;s closing price on {contest.contestDate}.
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="guess"
                name="guess"
                type="number"
                step="0.01"
                min="0"
                defaultValue={myGuessDollars}
                required
                className="max-w-[140px]"
              />
              <Button type="submit" size="sm">
                Update guess
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
