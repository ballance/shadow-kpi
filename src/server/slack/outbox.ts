import { eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { slackInstalls, slackOutbox } from '@/server/db/schema';
import type { SlackApiClient } from '@/server/slack/api';
import { computeNextState, type NextRowState } from '@/server/slack/backoff';
import { decryptBotToken } from '@/server/slack/crypto';

export interface EnqueueInput {
  workspaceId: string;
  targetKind: 'channel' | 'dm';
  targetId: string;
  payload: { text: string; blocks: unknown[] };
  dedupKey: string | null;
}

export async function enqueueOutboxMessages(
  db: Db,
  messages: EnqueueInput[],
): Promise<void> {
  if (messages.length === 0) return;
  await db
    .insert(slackOutbox)
    .values(
      messages.map((m) => ({
        workspaceId: m.workspaceId,
        targetKind: m.targetKind,
        targetId: m.targetId,
        payload: JSON.stringify(m.payload),
        dedupKey: m.dedupKey,
      })),
    )
    .onConflictDoNothing({
      target: slackOutbox.dedupKey,
      where: sql`${slackOutbox.dedupKey} IS NOT NULL`,
    });
}

export interface DrainOptions {
  api: SlackApiClient;
  tokenEncKey: string;
  batchLimit: number;
  wallClockBudgetMs: number;
  sendIntervalMs: number;
}

export interface DrainResult {
  sent: number;
  failed: number;
  deferred: number;
  scanned: number;
}

interface InstallTokenCache {
  token: string;
  revoked: boolean;
}

type OutboxRow = {
  id: string;
  workspace_id: string;
  target_kind: 'channel' | 'dm';
  target_id: string;
  payload: string;
  attempts: number;
};

export async function drainOutbox(
  db: Db,
  opts: DrainOptions,
): Promise<DrainResult> {
  const deadline = Date.now() + opts.wallClockBudgetMs;
  const tokenCache = new Map<string, InstallTokenCache>();
  const dmChannelCache = new Map<string, string>();
  let sent = 0;
  let failed = 0;
  let deferred = 0;
  let scanned = 0;

  while (Date.now() < deadline) {
    const raw = await db.execute<OutboxRow>(sql`
      SELECT id, workspace_id, target_kind, target_id, payload, attempts
      FROM slack_outbox
      WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY workspace_id, created_at
      LIMIT ${opts.batchLimit}
      FOR UPDATE SKIP LOCKED
    `);

    // postgres-js drizzle returns the array directly (iterable of row objects)
    const rows: OutboxRow[] = Array.from(raw as Iterable<OutboxRow>);

    if (rows.length === 0) break;
    scanned += rows.length;

    const byWorkspace = new Map<string, OutboxRow[]>();
    for (const r of rows) {
      const list = byWorkspace.get(r.workspace_id) ?? [];
      list.push(r);
      byWorkspace.set(r.workspace_id, list);
    }

    for (const [workspaceId, group] of byWorkspace) {
      const cached =
        tokenCache.get(workspaceId) ??
        (await loadToken(db, workspaceId, opts.tokenEncKey));
      tokenCache.set(workspaceId, cached);

      if (cached.revoked) {
        for (const row of group) {
          await markRow(db, row.id, {
            status: 'failed_permanent',
            attempts: row.attempts,
            nextAttemptAt: new Date(),
            sentAt: null,
            lastError: 'install_revoked',
          });
          failed += 1;
        }
        continue;
      }

      for (const row of group) {
        if (Date.now() >= deadline) {
          deferred += 1;
          continue;
        }

        const payload = JSON.parse(row.payload) as { text: string; blocks: unknown[] };

        let channel = row.target_id;
        if (row.target_kind === 'dm') {
          const cacheKey = `${workspaceId}:${row.target_id}`;
          const cached_dm = dmChannelCache.get(cacheKey);
          if (cached_dm) {
            channel = cached_dm;
          } else {
            const open = await opts.api.conversationsOpen({
              token: cached.token,
              userId: row.target_id,
            });
            if (!open.ok) {
              const next = computeNextState(
                { ok: false, error: open.error },
                row.attempts,
                new Date(),
              );
              await markRow(db, row.id, next);
              if (next.status === 'sent') sent += 1;
              else if (next.status === 'failed_permanent') failed += 1;
              else deferred += 1;
              continue;
            }
            channel = open.channelId;
            dmChannelCache.set(cacheKey, channel);
          }
        }

        const result = await opts.api.postMessage({
          token: cached.token,
          channel,
          text: payload.text,
          blocks: payload.blocks,
        });

        const next = computeNextState(
          {
            ok: result.ok,
            error: result.error,
            retryAfterSeconds: result.retryAfterSeconds,
          },
          row.attempts,
          new Date(),
        );

        if (
          !result.ok &&
          (result.error === 'token_revoked' ||
            result.error === 'account_inactive' ||
            result.error === 'invalid_auth')
        ) {
          await db
            .update(slackInstalls)
            .set({ revokedAt: new Date() })
            .where(eq(slackInstalls.workspaceId, workspaceId));
          tokenCache.set(workspaceId, { ...cached, revoked: true });
        }

        await markRow(db, row.id, next);
        if (next.status === 'sent') sent += 1;
        else if (next.status === 'failed_permanent') failed += 1;
        else deferred += 1;

        if (opts.sendIntervalMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, opts.sendIntervalMs));
        }
      }
    }
  }

  return { sent, failed, deferred, scanned };
}

async function loadToken(
  db: Db,
  workspaceId: string,
  keyBase64: string,
): Promise<InstallTokenCache> {
  const [row] = await db
    .select({
      ct: slackInstalls.botTokenCiphertext,
      iv: slackInstalls.botTokenIv,
      revokedAt: slackInstalls.revokedAt,
    })
    .from(slackInstalls)
    .where(eq(slackInstalls.workspaceId, workspaceId))
    .limit(1);
  if (!row) return { token: '', revoked: true };
  if (row.revokedAt) return { token: '', revoked: true };
  return {
    token: decryptBotToken({ ciphertext: row.ct, iv: row.iv }, keyBase64),
    revoked: false,
  };
}

async function markRow(db: Db, id: string, next: NextRowState): Promise<void> {
  await db
    .update(slackOutbox)
    .set({
      status: next.status,
      attempts: next.attempts,
      nextAttemptAt: next.nextAttemptAt,
      sentAt: next.sentAt,
      lastError: next.lastError,
    })
    .where(eq(slackOutbox.id, id));
}
