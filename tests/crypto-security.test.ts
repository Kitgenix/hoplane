import { describe, expect, it } from 'vitest';
import { hashPassword, randomToken, timingSafeEqual, verifyPassword } from '../src/worker/lib/crypto';

describe('password hashing format and compatibility', () => {
  it('verifies a newly hashed password and rejects an incorrect one', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored).toMatch(/^pbkdf2\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
    expect(await verifyPassword('not the password', stored)).toBe(false);
  });

  it('rejects malformed hash fields without throwing', async () => {
    const examples = [
      'pbkdf2$100000$00000000000000000000000000000000$00',
      'pbkdf2$100001$00000000000000000000000000000000$' + '00'.repeat(32),
      'pbkdf2$100000$zz000000000000000000000000000000$' + '00'.repeat(32),
      'pbkdf2$100000$00000000000000000000000000000000$' + 'gg'.repeat(32),
      'pbkdf2$0$00000000000000000000000000000000$' + '00'.repeat(32),
      'pbkdf2$100000$00000000000000000000000000000000$' + '00'.repeat(32) + '$extra',
    ];
    for (const value of examples) expect(await verifyPassword('anything', value)).toBe(false);
  });

  it('accepts valid previous PBKDF2 format with fewer iterations', async () => {
    const salt = new Uint8Array(16);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('legacy password'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 5_000 }, key, 256);
    const hash = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const stored = `pbkdf2$5000$${'00'.repeat(16)}$${hash}`;
    expect(await verifyPassword('legacy password', stored)).toBe(true);
    expect(await verifyPassword('different', stored)).toBe(false);
  });
});

describe('session and API token helpers', () => {
  it('generates random URL-safe tokens', () => {
    const first = randomToken(32);
    const second = randomToken(32);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(32);
  });

  it('compares secrets without accidental prefix matching', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abcx')).toBe(false);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
  });
});
