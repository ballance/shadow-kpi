import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TTL_SECONDS = 600; // 10 min

export interface InstallStatePayload {
  kind: 'install';
  teamId: string;
  nonce: string;
  exp: number;
}

export interface LinkStatePayload {
  kind: 'link';
  userId: string;
  teamId: string;
  nonce: string;
  exp: number;
}

type Payload = InstallStatePayload | LinkStatePayload;

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 ? '='.repeat(4 - (input.length % 4)) : '';
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

export function signStateToken(
  payload: Omit<Payload, 'exp'>,
  key: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const full: Payload = { ...(payload as Payload), exp: nowSeconds + TTL_SECONDS };
  const body = b64url(JSON.stringify(full));
  const mac = createHmac('sha256', key).update(body).digest();
  return `${body}.${b64url(mac)}`;
}

export function verifyStateToken<T extends Payload>(
  token: string,
  key: string,
  cookieNonce: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): T | null {
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const macB64 = token.slice(dot + 1);
  const expectedMac = createHmac('sha256', key).update(body).digest();
  const actualMac = fromB64url(macB64);
  if (expectedMac.length !== actualMac.length) return null;
  if (!timingSafeEqual(expectedMac, actualMac)) return null;
  let parsed: Payload;
  try { parsed = JSON.parse(fromB64url(body).toString('utf8')) as Payload; }
  catch { return null; }
  if (parsed.exp < nowSeconds) return null;
  if (parsed.nonce !== cookieNonce) return null;
  return parsed as T;
}
