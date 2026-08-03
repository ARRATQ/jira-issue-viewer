import { describe, expect, it, beforeAll } from 'vitest';
import { encrypt, decrypt } from '../src/lib/crypto';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex, dev/test only
});

describe('encrypt/decrypt', () => {
  it('round-trips a plain text value', () => {
    const secret = 'my-jira-personal-access-token';
    const ciphertext = encrypt(secret);
    expect(ciphertext).not.toBe(secret);
    expect(decrypt(ciphertext)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const secret = 'same-secret';
    expect(encrypt(secret)).not.toBe(encrypt(secret));
  });

  it('throws when the auth tag does not match (tampered ciphertext)', () => {
    const ciphertext = encrypt('tamper-me');
    const tampered = ciphertext.slice(0, -4) + 'abcd';
    expect(() => decrypt(tampered)).toThrow();
  });
});
