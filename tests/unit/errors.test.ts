import { describe, expect, it } from 'vitest';
import { DomainError, toHttpResponse, ERROR_HTTP_STATUS } from '@/server/errors';

describe('DomainError', () => {
  it('captures code and message', () => {
    const err = new DomainError('INSUFFICIENT_BALANCE', 'You have 3, need 5.');
    expect(err.code).toBe('INSUFFICIENT_BALANCE');
    expect(err.message).toBe('You have 3, need 5.');
    expect(err).toBeInstanceOf(Error);
  });

  it('has a unique HTTP status mapping for each domain code', () => {
    expect(ERROR_HTTP_STATUS.INSUFFICIENT_BALANCE).toBe(400);
    expect(ERROR_HTTP_STATUS.INVITE_CODE_INVALID).toBe(404);
    expect(ERROR_HTTP_STATUS.NOT_AUTHENTICATED).toBe(401);
    expect(ERROR_HTTP_STATUS.NOT_TEAM_MEMBER).toBe(403);
  });
});

describe('toHttpResponse', () => {
  it('maps a DomainError to its status + body', () => {
    const err = new DomainError('INVITE_CODE_INVALID', 'No team found for that code.');
    const res = toHttpResponse(err);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'INVITE_CODE_INVALID', message: 'No team found for that code.' },
    });
  });

  it('maps an unknown Error to 500 with a generic message', () => {
    const err = new Error('something exploded');
    const res = toHttpResponse(err);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Something went wrong.');
  });

  it('maps an unknown DomainError code to 400', () => {
    const err = new DomainError('UNKNOWN_CODE' as never, 'huh');
    const res = toHttpResponse(err);
    expect(res.status).toBe(400);
  });
});
