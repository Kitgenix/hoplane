/** Cryptography helpers for Hoplane running in Cloudflare Workers. */
const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}

export function randomToken(bytes = 32): string {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 1024) throw new RangeError('Invalid random token length');
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Compare UTF-8 byte strings without exiting on the first mismatched byte. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/**
 * Legacy PBKDF2-SHA256 password format: pbkdf2$iterations$saltHex$hashHex.
 *
 * The workerd PBKDF2 implementation limits a single deriveBits call to 100,000
 * iterations. Keep existing hashes working; do NOT raise this number without
 * testing a stronger, versioned KDF and migration on the Workers runtime.
 */
const ITERATIONS = 100_000;
/** Highest iteration count verifyPassword accepts; imported hashes must not exceed it. */
export const PASSWORD_ITERATIONS = ITERATIONS;
const HASH_FORMAT = /^pbkdf2\$([1-9][0-9]*)\$([a-fA-F0-9]{32})\$([a-fA-F0-9]{64})$/;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toHex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${await derive(password, salt, ITERATIONS)}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (typeof stored !== 'string') return false;
  const parsed = HASH_FORMAT.exec(stored);
  if (!parsed) return false;
  const iterations = Number(parsed[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  const salt = fromHex(parsed[2]);
  if (!salt) return false;
  return timingSafeEqual(await derive(password, salt, iterations), parsed[3]);
}

export function uuid(): string {
  return crypto.randomUUID();
}
