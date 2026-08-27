import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import type { DomainEvent } from '@/server/events';
import {
  bets, markets, slackInstalls, slackTeamChannels,
  slackUserLinks, users, teams, ledgerEntries,
} from '@/server/db/schema';
import { drainOutbox, enqueueOutboxMessages, type EnqueueInput } from './outbox';
import type { SlackApiClient } from './api';
import {
  marketCreatedChannel, marketLockedChannel, marketLockedDm,
  marketResolvedChannel, marketResolvedDmWinner, marketResolvedDmLoser,
  marketVoidedDm, contestResolvedBlocks,
} from './blocks';

export interface SubscriberConfig {
  baseUrl: string;
  // Inline drain after each enqueue. Vercel Hobby caps cron jobs at daily
  // frequency, so the bundled /api/cron/slack-drain endpoint only runs once
  // a day as a backstop. When `inlineDrain` is set, the subscriber fires a
  // fire-and-forget drain immediately after writing outbox rows, giving
  // sub-second happy-path latency. The lease-based claim in drainOutbox
  // makes concurrent drain runs safe.
  inlineDrain?: {
    api: SlackApiClient;
    tokenEncKey: string;
  };
}

interface TeamContext {
  channelMapping: { workspaceId: string; channelId: string } | null;
  teamName: string;
  linkedBettors: Map<string, string>;
}

async function loadTeamContext(
  db: Db,
  teamId: string,
  bettorUserIds: string[],
): Promise<TeamContext | null> {
  const [mapping] = await db
    .select({
      workspaceId: slackTeamChannels.workspaceId,
      channelId: slackTeamChannels.channelId,
    })
    .from(slackTeamChannels)
    .innerJoin(
      slackInstalls,
      and(
        eq(slackInstalls.workspaceId, slackTeamChannels.workspaceId),
        isNull(slackInstalls.revokedAt),
      ),
    )
    .where(eq(slackTeamChannels.teamId, teamId))
    .limit(1);

  const [team] = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return null;

  const linkedBettors = new Map<string, string>();
  if (mapping && bettorUserIds.length > 0) {
    const linkRows = await db
      .select({ userId: slackUserLinks.userId, slackUserId: slackUserLinks.slackUserId })
      .from(slackUserLinks)
      .where(
        and(
          inArray(slackUserLinks.userId, bettorUserIds),
          eq(slackUserLinks.workspaceId, mapping.workspaceId),
        ),
      );
    for (const r of linkRows) linkedBettors.set(r.userId, r.slackUserId);
  }
  return {
    channelMapping: mapping ?? null,
    teamName: team.name,
    linkedBettors,
  };
}

async function loadBettors(db: Db, marketId: string) {
  return db
    .select({
      userId: bets.userId,
      side: bets.side,
      amount: bets.amount,
      displayName: users.displayName,
      name: users.name,
    })
    .from(bets)
    .innerJoin(users, eq(users.id, bets.userId))
    .where(eq(bets.marketId, marketId));
}

async function loadMarket(db: Db, marketId: string) {
  const [m] = await db
    .select({
      id: markets.id,
      title: markets.title,
      lockupAt: markets.lockupAt,
      creatorId: markets.creatorId,
      creatorName: users.displayName,
    })
    .from(markets)
    .innerJoin(users, eq(users.id, markets.creatorId))
    .where(eq(markets.id, marketId))
    .limit(1);
  return m ?? null;
}

function triggerInlineDrain(db: Db, cfg: SubscriberConfig): void {
  if (!cfg.inlineDrain) return;
  const { api, tokenEncKey } = cfg.inlineDrain;
  // Fire-and-forget. Errors are logged; outbox rows stay pending and the
  // daily cron / next event's inline drain will retry.
  void drainOutbox(db, {
    api,
    tokenEncKey,
    batchLimit: 50,
    wallClockBudgetMs: 5_000,
    sendIntervalMs: 1100,
  }).catch((err) => {
    console.error('inline slack drain failed', err);
  });
}

export function slackOutboxSubscriber(db: Db, cfg: SubscriberConfig) {
  return async (event: DomainEvent): Promise<void> => {
    switch (event.type) {
      case 'MarketCreated': {
        const m = await loadMarket(db, event.marketId);
        if (!m) return;
        const ctx = await loadTeamContext(db, event.teamId, []);
        if (!ctx?.channelMapping) return;
        const msg = marketCreatedChannel({
          baseUrl: cfg.baseUrl,
          teamName: ctx.teamName,
          marketId: m.id,
          title: m.title,
          lockupAtUnix: Math.floor(m.lockupAt.getTime() / 1000),
          creatorDisplay: m.creatorName ?? 'someone',
        });
        await enqueueOutboxMessages(db, [
          {
            workspaceId: ctx.channelMapping.workspaceId,
            targetKind: 'channel',
            targetId: ctx.channelMapping.channelId,
            payload: msg,
            dedupKey: `MarketCreated:${m.id}:channel`,
          },
        ]);
        triggerInlineDrain(db, cfg);
        return;
      }
      case 'MarketLocked': {
        const m = await loadMarket(db, event.marketId);
        if (!m) return;
        const bettorRows = await loadBettors(db, event.marketId);
        const bettorIds = Array.from(new Set(bettorRows.map((b) => b.userId)));
        const ctx = await loadTeamContext(db, event.teamId, bettorIds);
        if (!ctx?.channelMapping) return;

        const total = bettorRows.reduce((s, b) => s + b.amount, 0);
        const yes = bettorRows.filter((b) => b.side === 'yes').reduce((s, b) => s + b.amount, 0);
        const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0;
        const noPct = total > 0 ? 100 - yesPct : 0;

        const messages: EnqueueInput[] = [];
        messages.push({
          workspaceId: ctx.channelMapping.workspaceId,
          targetKind: 'channel',
          targetId: ctx.channelMapping.channelId,
          payload: marketLockedChannel({
            baseUrl: cfg.baseUrl,
            teamName: ctx.teamName,
            marketId: m.id,
            title: m.title,
            betCount: bettorRows.length,
            poolTotal: total,
            yesPct,
            noPct,
          }),
          dedupKey: `MarketLocked:${m.id}:channel`,
        });

        for (const b of bettorRows) {
          const slackUserId = ctx.linkedBettors.get(b.userId);
          if (!slackUserId) continue;
          messages.push({
            workspaceId: ctx.channelMapping.workspaceId,
            targetKind: 'dm',
            targetId: slackUserId,
            payload: marketLockedDm({
              baseUrl: cfg.baseUrl,
              title: m.title,
              marketId: m.id,
              stake: b.amount,
              side: b.side,
              creatorDisplay: m.creatorName ?? 'the creator',
            }),
            dedupKey: `MarketLocked:${m.id}:dm:${b.userId}`,
          });
        }
        await enqueueOutboxMessages(db, messages);
        triggerInlineDrain(db, cfg);
        return;
      }
      case 'MarketResolved': {
        const m = await loadMarket(db, event.marketId);
        if (!m) return;
        const bettorRows = await loadBettors(db, event.marketId);
        const bettorIds = Array.from(new Set(bettorRows.map((b) => b.userId)));
        const ctx = await loadTeamContext(db, event.teamId, bettorIds);
        if (!ctx?.channelMapping) return;

        const total = bettorRows.reduce((s, b) => s + b.amount, 0);
        const winners = bettorRows.filter((b) => b.side === event.outcome);
        const callerName = m.creatorName ?? 'creator';

        const messages: EnqueueInput[] = [];
        messages.push({
          workspaceId: ctx.channelMapping.workspaceId,
          targetKind: 'channel',
          targetId: ctx.channelMapping.channelId,
          payload: marketResolvedChannel({
            baseUrl: cfg.baseUrl,
            teamName: ctx.teamName,
            marketId: m.id,
            title: m.title,
            outcome: event.outcome,
            winnerCount: winners.length,
            poolTotal: total,
            callerDisplay: callerName,
          }),
          dedupKey: `MarketResolved:${m.id}:channel`,
        });

        // Personal P&L from ledger — payout entries for this market.
        const payoutLedger = await db
          .select({ userId: ledgerEntries.userId, amount: ledgerEntries.amount })
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.marketId, event.marketId),
              eq(ledgerEntries.kind, 'payout'),
            ),
          );
        const payoutByUser = new Map<string, number>();
        for (const e of payoutLedger) {
          payoutByUser.set(e.userId, (payoutByUser.get(e.userId) ?? 0) + e.amount);
        }

        // Per-team balance for each bettor.
        const balanceLedger =
          bettorIds.length === 0
            ? []
            : await db
                .select({ userId: ledgerEntries.userId, amount: ledgerEntries.amount })
                .from(ledgerEntries)
                .where(
                  and(
                    inArray(ledgerEntries.userId, bettorIds),
                    eq(ledgerEntries.teamId, event.teamId),
                  ),
                );
        const balances = new Map<string, number>();
        for (const r of balanceLedger) {
          balances.set(r.userId, (balances.get(r.userId) ?? 0) + r.amount);
        }

        for (const b of bettorRows) {
          const slackUserId = ctx.linkedBettors.get(b.userId);
          if (!slackUserId) continue;
          const isWinner = b.side === event.outcome;
          const payout = payoutByUser.get(b.userId) ?? 0;
          const balance = balances.get(b.userId) ?? 0;
          const payload = isWinner
            ? marketResolvedDmWinner({
                baseUrl: cfg.baseUrl,
                marketId: m.id,
                title: m.title,
                outcome: event.outcome,
                stake: b.amount,
                payout,
                newBalance: balance,
              })
            : marketResolvedDmLoser({
                baseUrl: cfg.baseUrl,
                marketId: m.id,
                title: m.title,
                outcome: event.outcome,
                stake: b.amount,
                newBalance: balance,
              });
          messages.push({
            workspaceId: ctx.channelMapping.workspaceId,
            targetKind: 'dm',
            targetId: slackUserId,
            payload,
            dedupKey: `MarketResolved:${m.id}:dm:${b.userId}`,
          });
        }
        await enqueueOutboxMessages(db, messages);
        triggerInlineDrain(db, cfg);
        return;
      }
      case 'MarketVoided': {
        const m = await loadMarket(db, event.marketId);
        if (!m) return;
        const bettorRows = await loadBettors(db, event.marketId);
        const bettorIds = Array.from(new Set(bettorRows.map((b) => b.userId)));
        const ctx = await loadTeamContext(db, event.teamId, bettorIds);
        if (!ctx?.channelMapping) return;
        const messages: EnqueueInput[] = [];
        for (const b of bettorRows) {
          const slackUserId = ctx.linkedBettors.get(b.userId);
          if (!slackUserId) continue;
          messages.push({
            workspaceId: ctx.channelMapping.workspaceId,
            targetKind: 'dm',
            targetId: slackUserId,
            payload: marketVoidedDm({
              baseUrl: cfg.baseUrl,
              marketId: m.id,
              title: m.title,
              stake: b.amount,
            }),
            dedupKey: `MarketVoided:${m.id}:dm:${b.userId}`,
          });
        }
        await enqueueOutboxMessages(db, messages);
        triggerInlineDrain(db, cfg);
        return;
      }
      case 'ContestResolved': {
        const ctx = await loadTeamContext(db, event.teamId, []);
        if (!ctx?.channelMapping) return;
        await enqueueOutboxMessages(db, [
          {
            workspaceId: ctx.channelMapping.workspaceId,
            targetKind: 'channel',
            targetId: ctx.channelMapping.channelId,
            payload: contestResolvedBlocks({
              symbol: event.symbol,
              contestDate: event.contestDate,
              actualCloseCents: event.actualCloseCents,
              winners: event.winners,
            }),
            dedupKey: `ContestResolved:${event.contestId}:channel`,
          },
        ]);
        triggerInlineDrain(db, cfg);
        return;
      }
      case 'CommentPosted':
        return;
    }
  };
}
