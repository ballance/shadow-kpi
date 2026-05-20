import { describe, expect, it } from 'vitest';
import { computeNextState } from '@/server/slack/backoff';

const now = new Date('2026-05-19T12:00:00Z');

describe('computeNextState', () => {
  it('marks sent on 2xx ok=true', () => {
    const r = computeNextState({ ok: true }, 0, now);
    expect(r.status).toBe('sent');
    expect(r.sentAt).toEqual(now);
  });

  it('honors retry-after on 429', () => {
    const r = computeNextState(
      { ok: false, error: 'ratelimited', retryAfterSeconds: 3 },
      0,
      now,
    );
    expect(r.status).toBe('pending');
    expect(r.attempts).toBe(1);
    expect(r.nextAttemptAt.getTime() - now.getTime()).toBe(3000);
  });

  it('exponential backoff on 5xx-equivalent (no retry-after)', () => {
    const r = computeNextState({ ok: false, error: 'internal_error' }, 1, now);
    expect(r.status).toBe('pending');
    expect(r.attempts).toBe(2);
    expect(r.nextAttemptAt.getTime() - now.getTime()).toBe(120_000);
  });

  it('caps backoff at 1 hour', () => {
    const r = computeNextState({ ok: false, error: 'internal_error' }, 10, now);
    expect(r.nextAttemptAt.getTime() - now.getTime()).toBe(3_600_000);
  });

  it('permanent failure on known 4xx errors', () => {
    for (const err of [
      'channel_not_found',
      'user_not_found',
      'not_in_channel',
      'token_revoked',
      'account_inactive',
      'is_archived',
      'invalid_auth',
    ]) {
      const r = computeNextState({ ok: false, error: err }, 0, now);
      expect(r.status, `error ${err}`).toBe('failed_permanent');
    }
  });

  it('permanent after 8 retryable attempts', () => {
    const r = computeNextState({ ok: false, error: 'internal_error' }, 8, now);
    expect(r.status).toBe('failed_permanent');
    expect(r.lastError).toBe('exceeded_retries');
  });
});
