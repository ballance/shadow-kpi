import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';

function keyBuffer(keyBase64: string): Buffer {
  const buf = Buffer.from(keyBase64, 'base64');
  if (buf.length !== 32) {
    throw new Error(`SLACK_TOKEN_ENC_KEY must decode to 32 bytes, got ${buf.length}`);
  }
  return buf;
}

export function encryptBotToken(
  plaintext: string,
  keyBase64: string,
): { ciphertext: string; iv: string } {
  const key = keyBuffer(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store ciphertext||authTag together so decrypt can split.
  return {
    ciphertext: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

export function decryptBotToken(
  { ciphertext, iv }: { ciphertext: string; iv: string },
  keyBase64: string,
): string {
  const key = keyBuffer(keyBase64);
  const ivBuf = Buffer.from(iv, 'base64');
  const blob = Buffer.from(ciphertext, 'base64');
  if (blob.length < 17) throw new Error('ciphertext too short');
  const authTag = blob.subarray(blob.length - 16);
  const encrypted = blob.subarray(0, blob.length - 16);
  const decipher = createDecipheriv(ALG, key, ivBuf);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
