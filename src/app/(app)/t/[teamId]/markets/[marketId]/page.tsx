import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { getMarketDetail, resolveMarket, voidMarket } from '@/server/markets';
import { placeBet } from '@/server/bets';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LivePoll } from './live-poll';

interface MarketDetailPageProps {
  params: Promise<{ teamId: string; marketId: string }>;
}

function fmtTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { teamId, marketId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/signin');

  const detail = await getMarketDetail(db, marketId);
  if (!detail || detail.market.teamId !== teamId) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Market not found</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          That market doesn't exist on this team.
        </CardContent>
      </Card>
    );
  }

  const market = detail.market;
  const myId = session.user.id;
  const isCreator = myId === market.creatorId;
  const nowDate = new Date();
  const beforeLockup = nowDate < market.lockupAt;
  const canResolve =
    isCreator &&
    (market.status === 'open' || market.status === 'locked') &&
    nowDate >= market.resolvesAt;
  const canBet = !isCreator && market.status === 'open' && beforeLockup;
  const canVoid = isCreator && market.status === 'open' && beforeLockup;
  const isResolved = market.status === 'resolved';

  const [balance, allowance] = await Promise.all([
    getBalance(db, { userId: myId, teamId }),
    getSpendableAllowance(db, { userId: myId, teamId }),
  ]);

  const bettorEmails = new Map<string, string>();
  if (isResolved && detail.bets.length > 0) {
    const ids = Array.from(new Set(detail.bets.map((b) => b.userId)));
    const rows = await db.select().from(users);
    for (const u of rows) if (ids.includes(u.id)) bettorEmails.set(u.id, u.email);
  }

  async function betAction(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    const parsed = z
      .object({
        side: z.enum(['yes', 'no']),
        amount: z.coerce.number().int().min(1).max(1000),
      })
      .safeParse({
        side: formData.get('side'),
        amount: formData.get('amount'),
      });
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'Pick a side and an amount.');
    }
    await placeBet(db, {
      marketId,
      userId: session.user.id,
      side: parsed.data.side,
      amount: parsed.data.amount,
    });
    revalidatePath(`/t/${teamId}/markets/${marketId}`);
  }

  async function resolveAction(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    const parsed = z
      .object({ outcome: z.enum(['yes', 'no']) })
      .safeParse({ outcome: formData.get('outcome') });
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'Pick yes or no.');
    }
    await resolveMarket(db, {
      marketId,
      userId: session.user.id,
      outcome: parsed.data.outcome,
    });
    revalidatePath(`/t/${teamId}/markets/${marketId}`);
  }

  async function voidAction() {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    await voidMarket(db, { marketId, userId: session.user.id });
    revalidatePath(`/t/${teamId}/markets/${marketId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <LivePoll enabled={market.status === 'open' || market.status === 'locked'} />

      <div>
        <div className="text-sm text-muted-foreground">{market.status}</div>
        <h1 className="text-2xl font-semibold">{market.title}</h1>
        {market.description && (
          <p className="mt-1 text-muted-foreground">{market.description}</p>
        )}
        <div className="mt-2 text-sm text-muted-foreground">
          Bets close: {fmtTime(market.lockupAt)} · Resolves: {fmtTime(market.resolvesAt)}
          {isResolved && market.outcome && (
            <> · Outcome: <strong>{market.outcome.toUpperCase()}</strong></>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Yes pool</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">🍩 {detail.pools.yes}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>No pool</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">🍩 {detail.pools.no}</CardContent>
        </Card>
      </div>

      {canBet && (
        <Card>
          <CardHeader>
            <CardTitle>Place a bet</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={betAction} className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Button type="submit" name="side" value="yes" variant="outline">
                  Bet Yes
                </Button>
                <Button type="submit" name="side" value="no" variant="outline">
                  Bet No
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Amount (🍩)</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min={1}
                  max={Math.max(1, balance)}
                  required
                  defaultValue={1}
                />
                <div className="text-sm text-muted-foreground">
                  Your balance: 🍩 {balance} (spendable this week: 🍩 {allowance})
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {canResolve && (
        <Card>
          <CardHeader>
            <CardTitle>Resolve this market</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={resolveAction} className="flex gap-2">
              <Button type="submit" name="outcome" value="yes">
                Resolve YES
              </Button>
              <Button type="submit" name="outcome" value="no" variant="outline">
                Resolve NO
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {canVoid && (
        <Card>
          <CardHeader>
            <CardTitle>Void this market</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Voiding refunds every bet. Only available before lockup.
            </p>
            <form action={voidAction}>
              <Button type="submit" variant="outline">
                Void market
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bets ({detail.bets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.bets.length === 0 ? (
            <p className="text-muted-foreground">No bets yet.</p>
          ) : isResolved ? (
            <ul className="flex flex-col gap-2">
              {detail.bets.map((b) => (
                <li key={b.id} className="flex items-center justify-between text-sm">
                  <span>
                    {nameFromEmail(bettorEmails.get(b.userId) ?? '???')} —{' '}
                    <strong>{b.side.toUpperCase()}</strong> · 🍩 {b.amount}
                  </span>
                  <span className="text-muted-foreground">{fmtTime(b.placedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              Identities are revealed after the market is resolved.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
