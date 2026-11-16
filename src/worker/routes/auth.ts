import { Hono } from 'hono';
import { z } from 'zod';
import type { InstanceInfo } from '../../shared/types';
import { authenticate, createSession, destroySession, requireRole } from '../auth';
import { VERSION, config, type AppEnv } from '../env';
import { hashPassword, sha256, timingSafeEqual, uuid, verifyPassword } from '../lib/crypto';
import { HttpError, badRequest } from '../lib/errors';
import { rateLimit, resetRateLimit } from '../lib/ratelimit';
import { parse } from '../services/links';
import { audit } from '../services/settings';

export const MIN_PASSWORD = 10;
export const passwordField = z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`).max(200);
export const emailField = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);

const routes = new Hono<AppEnv>();

routes.get('/instance', async (c) => {
  const cfg = config(c.env);
  const users = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  const info: InstanceInfo = {
    site_name: cfg.siteName,
    version: VERSION,
    setup_required: !users?.n,
    setup_enabled: !!c.env.SETUP_TOKEN && c.env.SETUP_TOKEN.length >= 8,
    case_sensitive: cfg.caseSensitive,
    slug_length: cfg.slugLength,
    retention_days: cfg.retentionDays,
    cache: !!c.env.CACHE,
    backups: !!c.env.BACKUPS,
  };
  return c.json(info);
});

async function clientKey(c: { req: { header(n: string): string | undefined } }) {
  return (await sha256(c.req.header('cf-connecting-ip') || 'unknown')).slice(0, 16);
}

routes.post('/auth/setup', async (c) => {
  const body = parse(
    z.object({ token: z.string().max(500), email: emailField, name: z.string().trim().max(100).default(''), password: passwordField }),
    await c.req.json().catch(() => null),
  );
  if (!(await rateLimit(c.env.DB, `setup:${await clientKey(c)}`, 10, 15 * 60_000))) throw new HttpError(429, 'Too many attempts. Try again later.');
  const expected = c.env.SETUP_TOKEN;
  if (!expected || expected.length < 8) throw new HttpError(503, 'Setup is disabled. Set the SETUP_TOKEN secret (at least 8 characters) and redeploy.');
  if (!timingSafeEqual(body.token, expected)) throw new HttpError(401, 'Setup token is incorrect');
  const id = uuid();
  const now = Date.now();
  // Only succeeds if no users exist yet, in a single statement so it is race-free.
  const res = await c.env.DB.prepare(
    "INSERT INTO users (id, email, name, password_hash, role, created_at) SELECT ?, ?, ?, ?, 'owner', ? WHERE NOT EXISTS (SELECT 1 FROM users)",
  )
    .bind(id, body.email, body.name, await hashPassword(body.password), now)
    .run();
  if (!res.meta.changes) throw new HttpError(409, 'This instance is already set up. Sign in instead.');
  await audit(c.env.DB, null, 'instance.setup', body.email);
  await createSession(c, id);
  return c.json({ ok: true });
});

routes.post('/auth/login', async (c) => {
  const body = parse(z.object({ email: emailField, password: z.string().max(200) }), await c.req.json().catch(() => null));
  const ipKey = `login:ip:${await clientKey(c)}`;
  const emailKey = `login:email:${await sha256(body.email)}`;
  const [ipOk, emailOk] = [await rateLimit(c.env.DB, ipKey, 20, 15 * 60_000), await rateLimit(c.env.DB, emailKey, 8, 15 * 60_000)];
  if (!ipOk || !emailOk) throw new HttpError(429, 'Too many sign-in attempts. Wait 15 minutes and try again.');
  const user = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(body.email).first<{ id: string; password_hash: string }>();
  // Always run a hash so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(body.password, user?.password_hash ?? 'pbkdf2$100000$00000000000000000000000000000000$00');
  if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect');
  await resetRateLimit(c.env.DB, emailKey);
  await c.env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
  await createSession(c, user.id);
  return c.json({ ok: true });
});

routes.post('/auth/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

routes.get('/auth/me', authenticate, (c) => {
  const p = c.get('principal');
  return c.json({ id: p.userId, email: p.email, name: p.name, role: p.role, scopes: p.scopes, via: p.via });
});

routes.post('/auth/password', authenticate, requireRole('viewer'), async (c) => {
  const p = c.get('principal');
  const body = parse(z.object({ current: z.string().max(200), next: passwordField }), await c.req.json().catch(() => null));
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(p.userId).first<{ password_hash: string }>();
  if (!(await verifyPassword(body.current, row?.password_hash))) throw badRequest('Current password is incorrect');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(body.next), p.userId),
    // Sign out every other device.
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(p.userId, p.sessionId ?? ''),
  ]);
  await audit(c.env.DB, p, 'user.password', p.email);
  return c.json({ ok: true });
});

export default routes;
