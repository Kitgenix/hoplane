import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiKey, Role, Scope, User } from '../../shared/types';
import { ROLES, SCOPES } from '../../shared/types';
import { atLeast, requireRole } from '../auth';
import type { AppEnv } from '../env';
import { hashPassword, randomToken, sha256, uuid } from '../lib/crypto';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { parse } from '../services/links';
import { audit, getSettings, saveSettings } from '../services/settings';
import { emailField, passwordField } from './auth';

const routes = new Hono<AppEnv>();
const roleField = z.enum(ROLES as [Role, ...Role[]]);

/* ------------------------------------------------------------------ users */

routes.get('/users', requireRole('admin'), async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, email, name, role, created_at, last_login_at FROM users ORDER BY created_at').all<User>();
  return c.json({ items: results });
});

/** Admins manage editors and viewers; only owners can create or change admins and owners. */
function assertCanAssign(actor: Role, target: Role) {
  if (actor !== 'owner' && atLeast(target, 'admin')) throw forbidden('Only an owner can manage admins and owners');
}

routes.post('/users', requireRole('admin'), async (c) => {
  const p = c.get('principal');
  const body = parse(
    z.object({ email: emailField, name: z.string().trim().max(100).default(''), role: roleField, password: passwordField }),
    await c.req.json().catch(() => null),
  );
  assertCanAssign(p.role, body.role);
  const id = uuid();
  try {
    await c.env.DB.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, body.email, body.name, await hashPassword(body.password), body.role, Date.now())
      .run();
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw conflict('A user with that email already exists');
    throw err;
  }
  await audit(c.env.DB, p, 'user.create', body.email, body.role);
  return c.json({ id }, 201);
});

async function ownerCount(db: D1Database) {
  return (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").first<{ n: number }>())!.n;
}

routes.patch('/users/:id', requireRole('admin'), async (c) => {
  const p = c.get('principal');
  const body = parse(
    z.object({ name: z.string().trim().max(100).optional(), role: roleField.optional(), password: passwordField.optional() }),
    await c.req.json().catch(() => null),
  );
  const target = await c.env.DB.prepare('SELECT id, email, role FROM users WHERE id = ?').bind(c.req.param('id')).first<{ id: string; email: string; role: Role }>();
  if (!target) throw notFound('User not found');
  assertCanAssign(p.role, target.role);
  if (body.role) {
    assertCanAssign(p.role, body.role);
    if (target.role === 'owner' && body.role !== 'owner' && (await ownerCount(c.env.DB)) <= 1) throw badRequest('There must always be at least one owner');
  }
  const stmts: D1PreparedStatement[] = [];
  if (body.name !== undefined) stmts.push(c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(body.name, target.id));
  if (body.role) stmts.push(c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, target.id));
  if (body.password) {
    stmts.push(c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(body.password), target.id));
    stmts.push(c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id));
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  await audit(c.env.DB, p, 'user.update', target.email, Object.keys(body).join(','));
  return c.json({ ok: true });
});

routes.delete('/users/:id', requireRole('admin'), async (c) => {
  const p = c.get('principal');
  const id = c.req.param('id');
  if (id === p.userId) throw badRequest('You cannot delete your own account');
  const target = await c.env.DB.prepare('SELECT email, role FROM users WHERE id = ?').bind(id).first<{ email: string; role: Role }>();
  if (!target) throw notFound('User not found');
  assertCanAssign(p.role, target.role);
  if (target.role === 'owner' && (await ownerCount(c.env.DB)) <= 1) throw badRequest('There must always be at least one owner');
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  await audit(c.env.DB, p, 'user.delete', target.email);
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ API keys */

routes.get('/keys', requireRole('viewer'), async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, prefix, scopes, created_at, last_used_at, expires_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(c.get('principal').userId)
    .all<Omit<ApiKey, 'scopes'> & { scopes: string }>();
  return c.json({ items: results.map((k) => ({ ...k, scopes: k.scopes.split(',') })) });
});

routes.post('/keys', requireRole('viewer'), async (c) => {
  const p = c.get('principal');
  const body = parse(
    z.object({
      name: z.string().trim().min(1).max(60),
      scopes: z.array(z.enum(SCOPES as [Scope, ...Scope[]])).min(1),
      expires_in_days: z.number().int().min(1).max(3650).nullable().optional(),
    }),
    await c.req.json().catch(() => null),
  );
  const scopes = [...new Set(body.scopes)].filter((s) => p.scopes.includes(s));
  if (!scopes.length) throw forbidden('Your role does not allow those permissions');
  const key = `hpl_${randomToken(30)}`;
  const id = uuid();
  const now = Date.now();
  const expires = body.expires_in_days ? now + body.expires_in_days * 86_400_000 : null;
  await c.env.DB.prepare('INSERT INTO api_keys (id, user_id, name, prefix, key_hash, scopes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, p.userId, body.name, key.slice(0, 10), await sha256(key), scopes.join(','), now, expires)
    .run();
  await audit(c.env.DB, p, 'apikey.create', body.name, scopes.join(','));
  // The full key is returned exactly once.
  return c.json({ id, key, name: body.name, scopes, expires_at: expires }, 201);
});

routes.delete('/keys/:id', requireRole('viewer'), async (c) => {
  const p = c.get('principal');
  const res = await c.env.DB.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').bind(c.req.param('id'), p.userId).run();
  if (!res.meta.changes) throw notFound('API key not found');
  await audit(c.env.DB, p, 'apikey.revoke', c.req.param('id'));
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ settings & audit */

routes.get('/settings', requireRole('admin'), async (c) => c.json(await getSettings(c.env.DB, true)));

routes.put('/settings', requireRole('admin'), async (c) => {
  const body = parse(
    z.object({
      blocked_domains: z
        .array(z.string().trim().toLowerCase().max(253).regex(/^(\*\.)?[a-z0-9.-]+$/, 'Enter domains like example.com'))
        .max(5000)
        .optional(),
      warn_all: z.boolean().optional(),
      track_bots: z.boolean().optional(),
    }),
    await c.req.json().catch(() => null),
  );
  await saveSettings(c.env.DB, body);
  await audit(c.env.DB, c.get('principal'), 'settings.update', Object.keys(body).join(','));
  return c.json(await getSettings(c.env.DB, true));
});

routes.get('/audit', requireRole('admin'), async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const { results } = await c.env.DB.prepare('SELECT id, ts, actor, action, target, detail FROM audit_log ORDER BY id DESC LIMIT 50 OFFSET ?')
    .bind((page - 1) * 50)
    .all();
  return c.json({ items: results, page });
});

export default routes;
