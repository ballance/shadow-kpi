import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { getMarketDetail, resolveMarket, voidMarket } from '@/server/markets';
import { addComment, listCommentsForMarket } from '@/server/comments';
import { placeBet } from '@/server/bets';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OddsBar } from '@/components/odds-bar';
import { StatusPill } from '@/components/status-pill';
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

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
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
        <CardContent className="text-fg-muted">
          That market doesn&apos;t exist on this team.
        </CardContent>
      </Card>
    );
  }

  const commentRows = await listCommentsForMarket(db, marketId);
  const commenterIds = Array.from(new Set(commentRows.map((c) => c.userId)));
  const commenterEmails = new Map<string, string>();
  if (commenterIds.length > 0) {
    const ucache = await db.select().from(users);
    for (const u of ucache) {
      if (commenterIds.includes(u.id)) commenterEmails.set(u.id, u.email);
    }
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

  // Fetch creator email for display
  const creatorRows = await db.select().from(users);
  const creatorEmail = creatorRows.find((u) => u.id === market.creatorId)?.email ?? '';
  const creatorName = creatorEmail ? nameFromEmail(creatorEmail) : 'Unknown';

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

  async function commentAction(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    const body = String(formData.get('body') ?? '').trim();
    if (body.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Comment cannot be empty.');
    }
    await addComment(db, { marketId, userId: session.user.id, body });
    revalidatePath(`/t/${teamId}/markets/${marketId}`);
  }

  const yesPool = detail.pools.yes;
  const noPool = detail.pools.no;
  const total = yesPool + noPool;
  const yesShare = total === 0 ? 0 : yesPool / total;
  const noShare = total === 0 ? 0 : noPool / total;

  return (
    <div className="flex flex-col gap-4">
      <LivePoll enabled={market.status === 'open' || market.status === 'locked'} />

      <Link
        href={`/t/${teamId}`}
        className="text-xs text-fg-muted hover:text-fg w-fit"
      >
        ← Back to team
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill status={market.status} outcome={market.outcome ?? null} />
          <span className="text-[10px] text-fg-dim">
            Created by {creatorName} · {relativeTime(market.createdAt)}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-fg leading-tight">
          {market.title}
        </h1>
        {market.description && (
          <p className="text-sm text-fg-muted">{market.description}</p>
        )}
        <div className="text-xs text-fg-dim">
          Bets close: {fmtTime(market.lockupAt)} · Resolves: {fmtTime(market.resolvesAt)}
        </div>
      </div>

      <OddsBar
        yesShare={yesShare}
        noShare={noShare}
        yesPool={yesPool}
        noPool={noPool}
        total={total}
      />

      {canBet && (
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-[11px] uppercase tracking-wide font-semibold">
              Place a bet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={betAction} className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Button
                  type="submit"
                  name="side"
                  value="yes"
                  className="bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20"
                >
                  Bet Yes
                </Button>
                <Button
                  type="submit"
                  name="side"
                  value="no"
                  className="bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20"
                >
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
                <div className="text-xs text-fg-muted">
                  Your balance: 🍩 {balance} (spendable this week: 🍩 {allowance})
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {canResolve && (
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-[11px] uppercase tracking-wide font-semibold">
              Call it
            </CardTitle>
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
          <CardHeader className="p-4">
            <CardTitle className="text-[11px] uppercase tracking-wide font-semibold">
              Void this market
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-fg-muted">
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

      {isResolved && market.outcome && (
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">
              Outcome:
            </div>
            <div
              className={`text-2xl font-bold mt-1 ${
                market.outcome === 'yes' ? 'text-accent' : 'text-danger'
              }`}
            >
              {market.outcome.toUpperCase()}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-[11px] uppercase tracking-wide font-semibold">
            Bets ({detail.bets.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.bets.length === 0 ? (
            <p className="text-sm text-fg-muted">No bets yet.</p>
          ) : isResolved ? (
            <ul className="flex flex-col gap-2">
              {detail.bets.map((b) => (
                <li key={b.id} className="flex items-center justify-between text-sm">
                  <span>
                    {nameFromEmail(bettorEmails.get(b.userId) ?? '???')} —{' '}
                    <strong>{b.side.toUpperCase()}</strong> · 🍩 {b.amount}
                  </span>
                  <span className="text-xs text-fg-dim">{fmtTime(b.placedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">
              Identities are revealed after the market is resolved.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-[11px] uppercase tracking-wide font-semibold">
            Comments ({commentRows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {commentRows.length === 0 ? (
            <p className="text-sm text-fg-muted">No comments yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {commentRows.map((c) => (
                <li key={c.id}>
                  <div className="text-xs font-semibold text-fg">
                    {nameFromEmail(commenterEmails.get(c.userId) ?? '???')}
                    <span className="font-normal text-fg-dim">
                      {' '}· {relativeTime(c.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm text-fg mt-0.5 whitespace-pre-wrap">
                    {c.body}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form action={commentAction} className="flex flex-col gap-2">
            <input
              name="body"
              placeholder="Say something"
              required
              maxLength={2000}
              className="flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm text-fg placeholder:text-fg-dim focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            />
            <button
              type="submit"
              className="self-start rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-raised transition-colors"
            >
              Post
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
