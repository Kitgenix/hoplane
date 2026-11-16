import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Role, Scope } from '../shared/types';
import { SCOPES } from '../shared/types';
import type { AppEnv, Principal } from './env';
import { randomToken, sha256 } from './lib/crypto';
import { HttpError, forbidden } from './lib/errors';

export const SESSION_DAYS = 14;
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function cookieName(c: Context) {
  return new URL(c.req.url).protocol === 'https:' ? '__Host-hpl_session' : 'hpl_session';
}

export function scopesForRole(role: Role): Scope[] {
  return role === 'viewer' ? ['links:read', 'analytics:read'] : [...SCOPES];
}

export function atLeast(role: Role, min: Role) {
  return RANK[role] >= RANK[min];
}

export async function createSession(c: Context<AppEnv>, userId: string) {
  const token = randomToken(32);
  const now = Date.now();
  const expires = now + SESSION_DAYS * 86_400_000;
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, expires, (c.req.header('user-agent') || '').slice(0, 200))
    .run();
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, cookieName(c), token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'Strict',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(c: Context<AppEnv>) {
  const token = getCookie(c, cookieName(c));
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  deleteCookie(c, cookieName(c), { path: '/', secure: new URL(c.req.url).protocol === 'https:' });
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
}

async function fromSession(c: Context<AppEnv>): Promise<Principal | null> {
  const token = getCookie(c, cookieName(c));
  if (!token || token.length > 200) return null;
  const id = await sha256(token);
  const row = await c.env.DB.prepare(
    'SELECT s.id AS sid, s.expires_at, u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?',
  )
    .bind(id)
    .first<UserRow & { sid: string; expires_at: number }>();
  if (!row || row.expires_at <= Date.now()) return null;
  return { userId: row.id, email: row.email, name: row.name, role: row.role, scopes: scopesForRole(row.role), via: 'session', sessionId: row.sid };
}

async function fromApiKey(c: Context<AppEnv>, key: string): Promise<Principal | null> {
  if (!key.startsWith('hpl_') || key.length > 200) return null;
  const row = await c.env.DB.prepare(
    'SELECT k.id AS kid, k.scopes, k.expires_at, u.id, u.email, u.name, u.role FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ?',
  )
    .bind(await sha256(key))
    .first<UserRow & { kid: string; scopes: string; expires_at: number | null }>();
  if (!row || (row.expires_at && row.expires_at <= Date.now())) return null;
  // A key can never exceed its owner's current role.
  const allowed = new Set(scopesForRole(row.role));
  const scopes = row.scopes.split(',').filter((s): s is Scope => allowed.has(s as Scope));
  c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(Date.now(), row.kid).run());
  return { userId: row.id, email: row.email, name: row.name, role: row.role, scopes, via: 'api_key' };
}

/** Resolves the caller from a session cookie or `Authorization: Bearer hpl_…` API key. */
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.req.header('authorization');
  let principal: Principal | null = null;
  if (auth?.toLowerCase().startsWith('bearer ')) {
    principal = await fromApiKey(c, auth.slice(7).trim());
  } else {
    principal = await fromSession(c);
    // CSRF: cookie-authenticated writes must come from this origin.
    if (principal && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      const site = c.req.header('sec-fetch-site');
      if ((origin && origin !== new URL(c.req.url).origin) || (site && site !== 'same-origin' && site !== 'none')) {
        throw new HttpError(403, 'Cross-site request blocked');
      }
    }
  }
  if (!principal) throw new HttpError(401, 'Sign in to continue');
  c.set('principal', principal);
  await next();
};

export const requireScope =
  (scope: Scope): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!c.get('principal').scopes.includes(scope)) throw forbidden(`This action needs the "${scope}" permission`);
    await next();
  };

/** Account administration is only available to signed-in users (not API keys). */
export const requireRole =
  (min: Role): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const p = c.get('principal');
    if (p.via !== 'session') throw forbidden('This action requires signing in to the dashboard');
    if (!atLeast(p.role, min)) throw forbidden();
    await next();
  };
