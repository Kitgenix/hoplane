import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiKey, Role, Scope, User } from '../../shared/types';
import { ROLES, SCOPES } from '../../shared/types';
import { atLeast, requireRole } from '../auth';
import { config, type AppEnv } from '../env';
import { hashPassword, randomToken, sha256, uuid } from '../lib/crypto';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { parse } from '../services/links';
import { audit, getSettings, saveSettings } from '../services/settings';
import { checkForUpdate, getLatestRelease, updateStatus } from '../services/updates';
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

routes.patch('/users/:id', requireRole('admin'), async (c) => {
  const p = c.get('principal');
  const body = parse(
    z.object({ name: z.string().trim().max(100).optional(), role: roleField.optional(), password: passwordField.optional() }),
    await c.req.json().catch(() => null),
  );
  const target = await c.env.DB.prepare('SELECT id, email, role FROM users WHERE id = ?').bind(c.req.param('id')).first<{ id: string; email: string; role: Role }>();
  if (!target) throw notFound('User not found');
  assertCanAssign(p.role, target.role);
  if (body.role) assertCanAssign(p.role, body.role);
  // Even administrators must supply their current password to change their own.
  if (body.password && target.id === p.userId) throw badRequest('Use the account password-change form to change your own password');

  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) {
    sets.push('name = ?');
    values.push(body.name);
  }
  if (body.role !== undefined) {
    sets.push('role = ?');
    values.push(body.role);
  }
  const newPasswordHash = body.password ? await hashPassword(body.password) : null;
  if (newPasswordHash) {
    sets.push('password_hash = ?');
    values.push(newPasswordHash);
  }
  if (!sets.length) return c.json({ ok: true });

  // Enforce last-owner safety inside the UPDATE itself. A separate ownerCount()
  // read is vulnerable when two owners are demoted concurrently.
  let sql = `UPDATE users SET ${sets.join(', ')} WHERE id = ? AND role = ?`;
  if (body.role && body.role !== 'owner') {
    sql += " AND (role != 'owner' OR (SELECT COUNT(*) FROM users WHERE role = 'owner') > 1)";
  }
  const update = c.env.DB.prepare(sql).bind(...values, target.id, target.role);
  if (newPasswordHash) {
    // Revoke both sessions AND API keys on an administrative password reset.
    // Match the new hash in the same transaction: if the conditional UPDATE
    // doesn't succeed, nothing is revoked either.
    const [result] = await c.env.DB.batch([
      update,
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)')
        .bind(target.id, target.id, newPasswordHash),
      c.env.DB.prepare('DELETE FROM api_keys WHERE user_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)')
        .bind(target.id, target.id, newPasswordHash),
    ]);
    if (!result.meta.changes) throw conflict('The account changed or the final owner cannot be demoted');
  } else {
    const result = await update.run();
    if (!result.meta.changes) throw conflict('The account changed or the final owner cannot be demoted');
  }
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
  // The owner-count test is part of the DELETE, not a racy preliminary query.
  const res = await c.env.DB.prepare(
    "DELETE FROM users WHERE id = ? AND role = ? AND (role != 'owner' OR (SELECT COUNT(*) FROM users WHERE role = 'owner') > 1)",
  ).bind(id, target.role).run();
  if (!res.meta.changes) throw conflict('The account changed or the final owner cannot be deleted');
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
  // Refuse unauthorised scopes rather than silently creating a weaker key.
  if (body.scopes.some((scope) => !p.scopes.includes(scope))) throw forbidden('Your role does not allow one or more requested permissions');
  const scopes = [...new Set(body.scopes)];
  const key = `hpl_${randomToken(30)}`;
  const id = uuid();
  const now = Date.now();
  const expires = body.expires_in_days ? now + body.expires_in_days * 86_400_000 : null;
  await c.env.DB.prepare('INSERT INTO api_keys (id, user_id, name, prefix, key_hash, scopes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, p.userId, body.name, key.slice(0, 10), await sha256(key), scopes.join(','), now, expires)
    .run();
  await audit(c.env.DB, p, 'apikey.create', body.name, scopes.join(','));
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
      safe_browsing: z.boolean().optional(),
      health_checks: z.boolean().optional(),
    }),
    await c.req.json().catch(() => null),
  );
  await saveSettings(c.env.DB, body);
  await audit(c.env.DB, c.get('principal'), 'settings.update', Object.keys(body).join(','));
  return c.json(await getSettings(c.env.DB, true));
});

/* ------------------------------------------------------------------ updates */

routes.get('/updates', requireRole('admin'), async (c) =>
  c.json(updateStatus(await getLatestRelease(c.env.DB), config(c.env).updateCheck)),
);

routes.post('/updates/check', requireRole('admin'), async (c) => {
  if (!config(c.env).updateCheck) throw badRequest('Update checks are turned off (UPDATE_CHECK is "false")');
  try {
    return c.json(updateStatus(await checkForUpdate(c.env.DB), true));
  } catch (err) {
    console.warn('update check failed', err);
    throw new HttpError(502, 'Could not reach GitHub to check for updates. Try again later.');
  }
});

routes.get('/audit', requireRole('admin'), async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const { results } = await c.env.DB.prepare('SELECT id, ts, actor, action, target, detail FROM audit_log ORDER BY id DESC LIMIT 50 OFFSET ?')
    .bind((page - 1) * 50)
    .all();
  return c.json({ items: results, page });
});

export default routes;
