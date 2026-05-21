import { describe, expect, it } from 'vitest';
import { encryptBotToken, decryptBotToken } from '@/server/slack/crypto';

const TEST_KEY_BASE64 = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE='; // 32 raw bytes

describe('slack crypto', () => {
  it('round-trips a token through encrypt/decrypt', () => {
    const plaintext = 'xoxb-1234567890-abcdefghij';
    const { ciphertext, iv } = encryptBotToken(plaintext, TEST_KEY_BASE64);
    const decrypted = decryptBotToken({ ciphertext, iv }, TEST_KEY_BASE64);
    expect(decrypted).toBe(plaintext);
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const plaintext = 'xoxb-1234567890-abcdefghij';
    const a = encryptBotToken(plaintext, TEST_KEY_BASE64);
    const b = encryptBotToken(plaintext, TEST_KEY_BASE64);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it('throws on tamper (auth tag mismatch)', () => {
    const { ciphertext, iv } = encryptBotToken('secret', TEST_KEY_BASE64);
    const tampered = Buffer.from(ciphertext, 'base64');
    tampered[0] ^= 0xff;
    expect(() =>
      decryptBotToken({ ciphertext: tampered.toString('base64'), iv }, TEST_KEY_BASE64),
    ).toThrow();
  });

  it('throws if key is not 32 bytes', () => {
    expect(() => encryptBotToken('x', Buffer.from('short').toString('base64'))).toThrow(
      /32 bytes/,
    );
  });
});
