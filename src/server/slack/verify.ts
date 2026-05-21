import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_SKEW_SECONDS = 5 * 60;

export interface VerifyInput {
  rawBody: string;
  timestamp: string;
  signature: string;
  signingSecret: string;
  nowSeconds?: number;
}

export function verifySlackSignature({
  rawBody,
  timestamp,
  signature,
  signingSecret,
  nowSeconds = Math.floor(Date.now() / 1000),
}: VerifyInput): boolean {
  if (!signature.startsWith('v0=')) return false;
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(nowSeconds - tsNum) > MAX_SKEW_SECONDS) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac('sha256', signingSecret).update(base).digest('hex')}`;
  const aBuf = Buffer.from(expected);
  const bBuf = Buffer.from(signature);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
