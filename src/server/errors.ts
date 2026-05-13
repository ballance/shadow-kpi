export const ERROR_HTTP_STATUS = {
  // 400 — bad input from a client
  INSUFFICIENT_BALANCE: 400,
  AMOUNT_BELOW_MINIMUM: 400,
  BET_AFTER_LOCKUP: 400,
  CREATOR_CANNOT_BET: 400,
  RESOLVE_TOO_EARLY: 400,
  MARKET_NOT_RESOLVABLE: 400,
  VALIDATION_FAILED: 400,
  ALREADY_MEMBER: 400,

  // 401 — unauthenticated
  NOT_AUTHENTICATED: 401,

  // 403 — authenticated but not allowed
  NOT_TEAM_MEMBER: 403,
  NOT_MARKET_CREATOR: 403,

  // 404 — not found
  INVITE_CODE_INVALID: 404,
  TEAM_NOT_FOUND: 404,
  MARKET_NOT_FOUND: 404,

  // 500 — fallback
  INTERNAL_ERROR: 500,
} as const;

export type DomainErrorCode = keyof typeof ERROR_HTTP_STATUS;

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export interface HttpErrorBody {
  error: { code: string; message: string };
}

export interface HttpResponse {
  status: number;
  body: HttpErrorBody;
}

export function toHttpResponse(err: unknown): HttpResponse {
  if (err instanceof DomainError) {
    const status = ERROR_HTTP_STATUS[err.code] ?? 400;
    return { status, body: { error: { code: err.code, message: err.message } } };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } },
  };
}
