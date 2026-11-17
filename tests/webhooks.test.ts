import { describe, expect, it } from 'vitest';
import { consumeWebhookBatch, deliver, isValidWebhookUrl, makeEvent, retryDelaySeconds, sign, type WebhookMessage } from '../src/worker/services/webhooks';

describe('webhook signing', () => {
  it('matches the Standard Webhooks reference vector', async () => {
    // From the Standard Webhooks specification's test suite.
    const signature = await sign('msg_p5jXN8AQM9LWM0D4loKWxJek', 1614265330, '{"test": 2432232314}', 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw');
    expect(signature).toBe('v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
  });

  it('accepts only public HTTPS endpoints', () => {
    expect(isValidWebhookUrl('https://hooks.example.com/in')).toBe(true);
    for (const url of ['http://hooks.example.com/in', 'https://127.0.0.1/in', 'https://localhost/in', 'https://hooks.example.com:8443/in', 'https://user:pw@hooks.example.com/']) {
      expect(isValidWebhookUrl(url), url).toBe(false);
    }
  });
});

describe('webhook delivery', () => {
  const hook = { url: 'https://hooks.example.com/in', secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw' };

  it('sends a signed Standard Webhooks request', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const event = makeEvent('link.created', { link: { slug: 'x' } });
    const r = await deliver(hook, event, async (url, init) => {
      seen = { url, init: init! };
      return new Response(null, { status: 204 });
    });
    expect(r).toEqual({ ok: true, status: 204, error: null });
    const headers = new Headers(seen!.init.headers);
    const body = String(seen!.init.body);
    expect(JSON.parse(body)).toEqual({ type: 'link.created', timestamp: event.timestamp, data: { link: { slug: 'x' } } });
    expect(headers.get('webhook-id')).toBe(event.id);
    expect(headers.get('webhook-signature')).toBe(await sign(event.id, Number(headers.get('webhook-timestamp')), body, hook.secret));
    expect(seen!.init.redirect).toBe('manual');
  });

  it('treats errors, redirects and bad URLs as failures', async () => {
    const event = makeEvent('link.deleted', {});
    expect(await deliver(hook, event, async () => new Response('no', { status: 500 }))).toMatchObject({ ok: false, status: 500 });
    expect(await deliver(hook, event, async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example.com' } }))).toMatchObject({ ok: false, status: 302 });
    expect(await deliver(hook, event, async () => { throw new TypeError('offline'); })).toMatchObject({ ok: false, status: null });
    let called = false;
    expect(await deliver({ ...hook, url: 'http://hooks.example.com/' }, event, async () => { called = true; return new Response(); })).toMatchObject({ ok: false });
    expect(called).toBe(false);
  });

  it('backs off between retries', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelaySeconds)).toEqual([30, 120, 480, 1920, 7680, 21600, 21600]);
  });
});

describe('webhook queue consumer', () => {
  /** A minimal D1 stand-in that answers the consumer's two queries. */
  function fakeDb(rows: Record<string, unknown>[]) {
    const writes: string[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          all: async () => ({ results: rows.filter((r) => args.includes(r.id)) }),
          run: async () => (writes.push(sql), { meta: { changes: 1 } }),
        }),
      }),
    };
    return { db: db as unknown as D1Database, writes };
  }
  function message(body: WebhookMessage, attempts = 1) {
    const state = { acked: false, retried: null as null | number };
    return {
      state,
      msg: { id: 'm', timestamp: new Date(), attempts, body, ack: () => (state.acked = true), retry: (o?: { delaySeconds?: number }) => (state.retried = o?.delaySeconds ?? 0) },
    };
  }
  const row = (id: string, enabled = 1) => ({ id, url: 'https://hooks.example.com/in', secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', events: '["link.created"]', enabled });

  it('acks deliveries, retries failures with backoff, and drops messages for removed endpoints', async () => {
    const { db } = fakeDb([row('ok'), row('down'), row('off', 0)]);
    const ev = makeEvent('link.created', {});
    const ok = message({ webhook_id: 'ok', event: ev });
    const down = message({ webhook_id: 'down', event: ev }, 3);
    const off = message({ webhook_id: 'off', event: ev });
    const gone = message({ webhook_id: 'gone', event: ev });
    const unsubscribed = message({ webhook_id: 'ok', event: makeEvent('link.clicked', {}) });
    const batch = { queue: 'hoplane-webhooks', messages: [ok, down, off, gone, unsubscribed].map((m) => m.msg) } as unknown as MessageBatch<WebhookMessage>;
    // Only "ok" and "down" are delivered, in that order: the first succeeds, the second fails.
    const answers = [200, 503];
    await consumeWebhookBatch(batch, { DB: db } as never, async () => new Response(null, { status: answers.shift() }));
    expect(answers).toEqual([]);
    expect(ok.state).toEqual({ acked: true, retried: null });
    expect(down.state).toEqual({ acked: false, retried: 480 });
    expect(off.state.acked).toBe(true);
    expect(gone.state.acked).toBe(true);
    expect(unsubscribed.state.acked).toBe(true);
  });
});
