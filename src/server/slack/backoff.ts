export interface SlackResponseLike {
  ok: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

export interface NextRowState {
  status: 'pending' | 'sent' | 'failed_permanent';
  attempts: number;
  nextAttemptAt: Date;
  sentAt: Date | null;
  lastError: string | null;
}

const PERMANENT_ERRORS = new Set([
  'channel_not_found',
  'user_not_found',
  'not_in_channel',
  'token_revoked',
  'account_inactive',
  'is_archived',
  'invalid_auth',
  'no_permission',
  'cannot_dm_bot',
]);

const MAX_RETRYABLE_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

export function computeNextState(
  resp: SlackResponseLike,
  currentAttempts: number,
  now: Date,
): NextRowState {
  if (resp.ok) {
    return {
      status: 'sent',
      attempts: currentAttempts,
      nextAttemptAt: now,
      sentAt: now,
      lastError: null,
    };
  }

  const err = resp.error ?? 'unknown_error';

  if (PERMANENT_ERRORS.has(err)) {
    return {
      status: 'failed_permanent',
      attempts: currentAttempts,
      nextAttemptAt: now,
      sentAt: null,
      lastError: err,
    };
  }

  const attempts = currentAttempts + 1;

  let delayMs: number;
  if (resp.retryAfterSeconds && resp.retryAfterSeconds > 0) {
    delayMs = resp.retryAfterSeconds * 1000;
  } else {
    delayMs = Math.min(60_000 * 2 ** (attempts - 1), MAX_BACKOFF_MS);
  }

  if (attempts > MAX_RETRYABLE_ATTEMPTS) {
    return {
      status: 'failed_permanent',
      attempts,
      nextAttemptAt: new Date(now.getTime() + delayMs),
      sentAt: null,
      lastError: 'exceeded_retries',
    };
  }

  return {
    status: 'pending',
    attempts,
    nextAttemptAt: new Date(now.getTime() + delayMs),
    sentAt: null,
    lastError: err,
  };
}
