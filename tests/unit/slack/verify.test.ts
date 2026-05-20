import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySlackSignature } from '@/server/slack/verify';

const SECRET = 'test_signing_secret';

function sign(body: string, ts: string): string {
  const base = `v0:${ts}:${body}`;
  const hash = createHmac('sha256', SECRET).update(base).digest('hex');
  return `v0=${hash}`;
}

describe('verifySlackSignature', () => {
  const body = '{"event":"x"}';
  const now = Math.floor(Date.now() / 1000);

  it('accepts a valid signature', () => {
    const ts = String(now);
    expect(
      verifySlackSignature({
        rawBody: body,
        timestamp: ts,
        signature: sign(body, ts),
        signingSecret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = String(now);
    const sig = sign(body, ts);
    expect(
      verifySlackSignature({
        rawBody: body + 'x',
        timestamp: ts,
        signature: sig,
        signingSecret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it('rejects a stale timestamp (> 5 min)', () => {
    const ts = String(now - 600);
    expect(
      verifySlackSignature({
        rawBody: body,
        timestamp: ts,
        signature: sign(body, ts),
        signingSecret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it('rejects a wrong signing secret', () => {
    const ts = String(now);
    expect(
      verifySlackSignature({
        rawBody: body,
        timestamp: ts,
        signature: sign(body, ts),
        signingSecret: 'wrong_secret',
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it('rejects missing or malformed signature', () => {
    const ts = String(now);
    expect(
      verifySlackSignature({
        rawBody: body,
        timestamp: ts,
        signature: 'not-v0=abc',
        signingSecret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(false);
  });
});
