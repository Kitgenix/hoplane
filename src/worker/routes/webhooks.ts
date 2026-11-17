/**
 * Webhook endpoint management (owners and admins, dashboard session only).
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { WEBHOOK_EVENTS, type WebhookEventType } from '../../shared/types';
import { requireRole } from '../auth';
import type { AppEnv } from '../env';
import { uuid } from '../lib/crypto';
import { badRequest, notFound } from '../lib/errors';
import { parse } from '../services/links';
import { audit } from '../services/settings';
import { clearWebhookCache, deliver, isValidWebhookUrl, makeEvent, newSecret, recordResult, toEndpoint, type WebhookRow } from '../services/webhooks';

const MAX_WEBHOOKS = 20;
const routes = new Hono<AppEnv>();

const urlField = z.string().trim().max(2048).refine(isValidWebhookUrl, 'Use an https:// URL on a public hostname and the default port');
const eventsField = z.array(z.enum(WEBHOOK_EVENTS as unknown as [WebhookEventType, ...WebhookEventType[]])).min(1, 'Choose at least one event').max(WEBHOOK_EVENTS.length);

async function requireWebhook(db: D1Database, id: string): Promise<WebhookRow> {
  const row = await db.prepare('SELECT * FROM webhooks WHERE id = ?').bind(id).first<WebhookRow>();
  if (!row) throw notFound('Webhook not found');
  return row;
}

routes.get('/webhooks', requireRole('admin'), async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM webhooks ORDER BY created_at').all<WebhookRow>();
  return c.json({ items: results.map(toEndpoint), queue: !!c.env.WEBHOOK_QUEUE });
});

routes.post('/webhooks', requireRole('admin'), async (c) => {
  const body = parse(
    z.object({ url: urlField, description: z.string().trim().max(200).default(''), events: eventsField }),
    await c.req.json().catch(() => null),
  );
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM webhooks').first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_WEBHOOKS) throw badRequest(`An instance can have at most ${MAX_WEBHOOKS} webhooks`);
  const p = c.get('principal');
  const id = uuid();
  const secret = newSecret();
  await c.env.DB.prepare('INSERT INTO webhooks (id, url, description, secret, events, enabled, created_by, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
    .bind(id, body.url, body.description, secret, JSON.stringify([...new Set(body.events)]), p.userId, Date.now())
    .run();
  clearWebhookCache();
  await audit(c.env.DB, p, 'webhook.create', body.url, body.events.join(','));
  // The only response that contains the secret, apart from a rotation.
  return c.json({ ...toEndpoint(await requireWebhook(c.env.DB, id)), secret }, 201);
});

routes.patch('/webhooks/:id', requireRole('admin'), async (c) => {
  const body = parse(
    z.object({ url: urlField.optional(), description: z.string().trim().max(200).optional(), events: eventsField.optional(), enabled: z.boolean().optional() }),
    await c.req.json().catch(() => null),
  );
  const row = await requireWebhook(c.env.DB, c.req.param('id'));
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.url !== undefined) (sets.push('url = ?'), args.push(body.url));
  if (body.description !== undefined) (sets.push('description = ?'), args.push(body.description));
  if (body.events !== undefined) (sets.push('events = ?'), args.push(JSON.stringify([...new Set(body.events)])));
  if (body.enabled !== undefined) (sets.push('enabled = ?'), args.push(body.enabled ? 1 : 0));
  // Re-enabling or retargeting starts with a clean failure count.
  if (body.enabled || body.url !== undefined) sets.push('failures = 0');
  if (sets.length) await c.env.DB.prepare(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = ?`).bind(...args, row.id).run();
  clearWebhookCache();
  await audit(c.env.DB, c.get('principal'), 'webhook.update', row.url, Object.keys(body).join(','));
  return c.json(toEndpoint(await requireWebhook(c.env.DB, row.id)));
});

routes.delete('/webhooks/:id', requireRole('admin'), async (c) => {
  const row = await requireWebhook(c.env.DB, c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ?').bind(row.id).run();
  clearWebhookCache();
  await audit(c.env.DB, c.get('principal'), 'webhook.delete', row.url);
  return c.json({ ok: true });
});

routes.post('/webhooks/:id/rotate', requireRole('admin'), async (c) => {
  const row = await requireWebhook(c.env.DB, c.req.param('id'));
  const secret = newSecret();
  await c.env.DB.prepare('UPDATE webhooks SET secret = ? WHERE id = ?').bind(secret, row.id).run();
  clearWebhookCache();
  await audit(c.env.DB, c.get('principal'), 'webhook.rotate', row.url);
  return c.json({ ...toEndpoint({ ...row, secret }), secret });
});

/** Send a `webhook.test` event right away (not queued) and report what the endpoint answered. */
routes.post('/webhooks/:id/test', requireRole('admin'), async (c) => {
  const row = await requireWebhook(c.env.DB, c.req.param('id'));
  const result = await deliver(row, makeEvent('webhook.test', { webhook: { id: row.id }, message: 'This is a test event from your Hoplane instance.' }));
  await recordResult(c.env.DB, row.id, result);
  return c.json(result);
});

export default routes;
