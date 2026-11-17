/**
 * Cloudflare Access sign-in.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 *
 * When Cloudflare Access protects the dashboard, every request it lets through
 * carries a signed JWT (the `Cf-Access-Jwt-Assertion` header, also in the
 * `CF_Authorization` cookie). Hoplane verifies that token itself (RS256
 * signature against the team's published keys, issuer, audience and expiry)
 * because the Worker may also be reachable without Access, for example on
 * workers.dev, where anyone could send a forged header.
 */

export interface AccessConfig {
  /** https://<team>.cloudflareaccess.com */
  issuer: string;
  /** The Access application's Audience (AUD) tag. */
  aud: string;
}

export interface AccessClaims {
  email: string;
  sub: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const KEYS_TTL_MS = 60 * 60_000;
/** An unknown key id triggers a refresh at most this often, so forged tokens cannot hammer the certs endpoint. */
const REFRESH_FLOOR_MS = 60_000;
const CLOCK_SKEW_S = 60;

export function accessConfig(env: { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string }): AccessConfig | null {
  const team = (env.ACCESS_TEAM_DOMAIN ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  const aud = (env.ACCESS_AUD ?? '').trim();
  if (!aud || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) return null;
  return { issuer: `https://${team}`, aud };
}

let keyCache: { issuer: string; at: number; keys: (JsonWebKey & { kid?: string })[] } | null = null;

export function clearAccessKeyCache() {
  keyCache = null;
}

async function signingKey(cfg: AccessConfig, kid: string, fetcher: Fetcher): Promise<CryptoKey | null> {
  const now = Date.now();
  const cached = keyCache?.issuer === cfg.issuer ? keyCache : null;
  let jwk = cached && now - cached.at < KEYS_TTL_MS ? cached.keys.find((k) => k.kid === kid) : undefined;
  if (!jwk && (!cached || now - cached.at >= REFRESH_FLOOR_MS)) {
    const res = await fetcher(`${cfg.issuer}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
    keyCache = { issuer: cfg.issuer, at: now, keys: Array.isArray(body.keys) ? body.keys : [] };
    jwk = keyCache.keys.find((k) => k.kid === kid);
  }
  if (!jwk || jwk.kty !== 'RSA') return null;
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

function b64urlBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
}

function b64urlJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(b64urlBytes(value)));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Verify an Access JWT; returns its claims, or null for anything invalid. Never throws. */
export async function verifyAccessJwt(token: string, cfg: AccessConfig, fetcher: Fetcher = (i, init) => fetch(i, init), now = Date.now()): Promise<AccessClaims | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || token.length > 8_192) return null;
    const header = b64urlJson(parts[0]);
    const payload = b64urlJson(parts[1]);
    if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

    const nowS = now / 1000;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== cfg.issuer || !aud.includes(cfg.aud)) return null;
    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < nowS) return null;
    if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_S > nowS) return null;
    // Service tokens have no email and cannot map to a person.
    if (typeof payload.email !== 'string' || !payload.email.includes('@')) return null;

    const key = await signingKey(cfg, header.kid, fetcher);
    if (!key) return null;
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    return { email: payload.email.trim().toLowerCase(), sub: String(payload.sub ?? ''), exp: payload.exp };
  } catch {
    return null;
  }
}
