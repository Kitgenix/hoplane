/**
 * Outgoing webhooks.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 *
 * Deliveries follow the Standard Webhooks specification (standardwebhooks.com):
 * `webhook-id`, `webhook-timestamp` and `webhook-signature: v1,<base64 HMAC-SHA256>`
 * over `<id>.<timestamp>.<body>`, with a `whsec_` secret. Existing verifier
 * libraries for that spec work unchanged.
 *
 * With a WEBHOOK_QUEUE binding (Cloudflare Queues), each delivery is queued and
 * retried with backoff until it succeeds or the queue's max_retries is reached.
 * Without one, each delivery is attempted once in the background.
 *
 * Click events never contain IP addresses, user agents, coordinates or visitor hashes.
 */
import { KITGENIX } from '../../shared/attribution';
import type { Link, WebhookEndpoint, WebhookEventType } from '../../shared/types';
import { VERSION, type Bindings } from '../env';
import { isPublicFetchTarget, safeUrl } from '../lib/url';

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 30_000;
/** On success, the endpoint row is updated at most this often (to spare D1 writes). */
const SUCCESS_WRITE_INTERVAL_MS = 60_000;
const QUEUE_BATCH = 100;

export interface WebhookEvent {
  id: string;
  type: WebhookEventType | 'webhook.test';
  timestamp: string;
  data: unknown;
}

/** The body of a WEBHOOK_QUEUE message. */
export interface WebhookMessage {
  webhook_id: string;
  event: WebhookEvent;
}

export interface WebhookRow {
  id: string;
  url: string;
  description: string;
  secret: string;
  events: string;
  enabled: number;
  created_by: string | null;
  created_at: number;
  last_status: number | null;
  last_error: string | null;
  last_attempt_at: number | null;
  failures: number;
}

export interface DeliveryResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: Fetcher = (input, init) => fetch(input, init);

/* ------------------------------------------------------------------ endpoints */

export function toEndpoint(row: WebhookRow): WebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    events: subscribed(row),
    enabled: !!row.enabled,
    created_at: row.created_at,
    secret_hint: `${row.secret.slice(0, 10)}…`,
    last_status: row.last_status,
    last_error: row.last_error,
    last_attempt_at: row.last_attempt_at,
    failures: row.failures,
  };
}

function subscribed(row: Pick<WebhookRow, 'events'>): WebhookEventType[] {
  try {
    const list = JSON.parse(row.events);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Only HTTPS URLs on public hostnames and the default port can receive webhooks. */
export function isValidWebhookUrl(value: unknown): value is string {
  const url = safeUrl(value);
  return !!url && url.startsWith('https://') && isPublicFetchTarget(url);
}

export function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `whsec_${btoa(String.fromCharCode(...bytes))}`;
}

let cache: { at: number; rows: WebhookRow[] } | null = null;

export function clearWebhookCache() {
  cache = null;
}

async function enabledWebhooks(db: D1Database): Promise<WebhookRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const { results } = await db.prepare('SELECT * FROM webhooks WHERE enabled = 1').all<WebhookRow>();
  cache = { at: Date.now(), rows: results };
  return results;
}

/* ------------------------------------------------------------------ delivery */

function secretKey(secret: string): Uint8Array | null {
  if (!secret.startsWith('whsec_')) return null;
  try {
    return Uint8Array.from(atob(secret.slice('whsec_'.length)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function sign(id: string, timestamp: number, body: string, secret: string): Promise<string> {
  const raw = secretKey(secret);
  if (!raw) throw new Error('Invalid webhook secret');
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return `v1,${btoa(String.fromCharCode(...mac))}`;
}

export function makeEvent(type: WebhookEvent['type'], data: unknown, now = Date.now()): WebhookEvent {
  return { id: `evt_${crypto.randomUUID().replace(/-/g, '')}`, type, timestamp: new Date(now).toISOString(), data };
}

/** POST one signed event. Never throws; a non-2xx answer or network error is a failed delivery. */
export async function deliver(hook: Pick<WebhookRow, 'url' | 'secret'>, event: WebhookEvent, fetcher: Fetcher = defaultFetch): Promise<DeliveryResult> {
  if (!isValidWebhookUrl(hook.url)) return { ok: false, status: null, error: 'The endpoint URL is not an allowed HTTPS address' };
  const body = JSON.stringify({ type: event.type, timestamp: event.timestamp, data: event.data });
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const res = await fetcher(hook.url, {
      method: 'POST',
      redirect: 'manual', // A redirect is a failed delivery; never re-send the body elsewhere.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        'user-agent': `${KITGENIX.product}-Webhooks/${VERSION} (+${KITGENIX.repository})`,
        'webhook-id': event.id,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': await sign(event.id, timestamp, body, hook.secret),
      },
      body,
    });
    await res.body?.cancel().catch(() => {});
    return res.ok ? { ok: true, status: res.status, error: null } : { ok: false, status: res.status, error: `The endpoint answered HTTP ${res.status}` };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return { ok: false, status: null, error: timedOut ? 'No response within 10 seconds' : 'Could not connect to the endpoint' };
  }
}

/** Keep the endpoint's delivery status current without writing to D1 on every success. */
export async function recordResult(db: D1Database, webhookId: string, r: DeliveryResult, now = Date.now()) {
  if (r.ok) {
    await db
      .prepare(
        `UPDATE webhooks SET failures = 0, last_status = ?, last_error = NULL, last_attempt_at = ?
         WHERE id = ? AND (failures > 0 OR last_attempt_at IS NULL OR last_attempt_at < ?)`,
      )
      .bind(r.status, now, webhookId, now - SUCCESS_WRITE_INTERVAL_MS)
      .run();
  } else {
    await db
      .prepare('UPDATE webhooks SET failures = failures + 1, last_status = ?, last_error = ?, last_attempt_at = ? WHERE id = ?')
      .bind(r.status, r.error?.slice(0, 300) ?? null, now, webhookId)
      .run();
  }
}

/**
 * Send events to every enabled endpoint subscribed to them. Never throws, so it
 * can run in waitUntil() after a response without risking the request.
 */
export async function emitEvents(env: Bindings, events: WebhookEvent[]): Promise<void> {
  if (!events.length) return;
  try {
    const hooks = await enabledWebhooks(env.DB);
    const messages: WebhookMessage[] = [];
    for (const event of events) for (const hook of hooks) if (subscribed(hook).includes(event.type as WebhookEventType)) messages.push({ webhook_id: hook.id, event });
    if (!messages.length) return;

    if (env.WEBHOOK_QUEUE) {
      for (let i = 0; i < messages.length; i += QUEUE_BATCH) {
        await env.WEBHOOK_QUEUE.sendBatch(messages.slice(i, i + QUEUE_BATCH).map((body) => ({ body })));
      }
      return;
    }
    // No queue: a single attempt per delivery.
    const byId = new Map(hooks.map((h) => [h.id, h]));
    await Promise.all(
      messages.map(async (m) => {
        const hook = byId.get(m.webhook_id)!;
        await recordResult(env.DB, hook.id, await deliver(hook, m.event));
      }),
    );
  } catch (err) {
    console.error('webhook emit failed', err);
  }
}

/**
 * Like emitEvents, but builds the events only if an enabled endpoint wants
 * `type`, so instances without webhooks do no extra work.
 */
export async function emitLazily(env: Bindings, type: WebhookEventType, build: () => WebhookEvent[] | Promise<WebhookEvent[]>): Promise<void> {
  try {
    const hooks = await enabledWebhooks(env.DB);
    if (!hooks.some((h) => subscribed(h).includes(type))) return;
    await emitEvents(env, await build());
  } catch (err) {
    console.error('webhook emit failed', err);
  }
}

/** Event payloads for link changes. Links never include a password or its hash. */
export const linkEvent = {
  created: (link: Link) => makeEvent('link.created', { link }),
  updated: (link: Link) => makeEvent('link.updated', { link }),
  deleted: (link: { id: string; slug: string }) => makeEvent('link.deleted', { link: { id: link.id, slug: link.slug } }),
};

/** Retry delay for the nth attempt: 30 s, 2 min, 8 min, 32 min, ~2 h, then 6 h. */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(6 * 3600, 30 * 4 ** Math.max(0, attempts - 1));
}

/** WEBHOOK_QUEUE consumer: deliver each message, retrying failures with backoff. */
export async function consumeWebhookBatch(batch: MessageBatch<WebhookMessage>, env: Bindings, fetcher?: Fetcher) {
  const ids = [...new Set(batch.messages.map((m) => m.body?.webhook_id).filter(Boolean))];
  // Read endpoints fresh so a disabled, deleted or re-keyed endpoint takes effect at once.
  const hooks = new Map<string, WebhookRow>();
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const { results } = await env.DB.prepare(`SELECT * FROM webhooks WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all<WebhookRow>();
    for (const row of results) hooks.set(row.id, row);
  }
  for (const msg of batch.messages) {
    const hook = hooks.get(msg.body?.webhook_id);
    if (!hook || !hook.enabled || !subscribed(hook).includes(msg.body.event?.type as WebhookEventType)) {
      msg.ack(); // Nothing to deliver to any more.
      continue;
    }
    const result = await deliver(hook, msg.body.event, fetcher);
    await recordResult(env.DB, hook.id, result);
    if (result.ok) msg.ack();
    else msg.retry({ delaySeconds: retryDelaySeconds(msg.attempts) });
  }
}
