import { createExecutionContext, env as testEnv, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { runMaintenance } from '../src/worker/cron';
import type { Bindings } from '../src/worker/env';
import { clearAccessKeyCache } from '../src/worker/lib/access';
import { clearSafeBrowsingCache } from '../src/worker/lib/safe-browsing';
import worker from '../src/worker/index';
import { accessJwt, accessKey } from './access-fixtures';
import { sinkHash } from './sink-fixtures';

const env = testEnv as unknown as Bindings;
const ORIGIN = 'https://links.test';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let cookie = '';

async function call(path: string, init: RequestInit & { cf?: Record<string, unknown>; auth?: string | false; bindings?: Partial<Bindings> } = {}) {
  const headers = new Headers(init.headers);
  if (init.auth) headers.set('authorization', `Bearer ${init.auth}`);
  else if (init.auth !== false && cookie) headers.set('cookie', cookie);
  if (!headers.has('user-agent')) headers.set('user-agent', BROWSER);
  if (init.body && typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const req = new Request(ORIGIN + path, { ...init, headers, redirect: 'manual', cf: init.cf } as RequestInit);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, init.bindings ? { ...env, ...init.bindings } : env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const json = <T = any>(res: Response) => res.json() as Promise<T>;
const post = (path: string, body: unknown, extra: Parameters<typeof call>[1] = {}) => call(path, { method: 'POST', body: JSON.stringify(body), ...extra });

function expectAttribution(html: string) {
  expect(html).toContain('href="https://kitgenix.com"');
  expect(html).toContain('href="https://github.com/Kitgenix"');
  expect(html).toContain('data-kitgenix-attribution');
}

beforeAll(async () => {
  const info = await json(await call('/api/instance', { auth: false }));
  expect(info.setup_required).toBe(true);
  expect(info.setup_enabled).toBe(true);

  const bad = await post('/api/auth/setup', { token: 'wrong-token', email: 'owner@example.com', password: 'a-strong-password' }, { auth: false });
  expect(bad.status).toBe(401);

  const res = await post('/api/auth/setup', { token: 'test-setup-token-123', email: 'Owner@Example.com', name: 'Olivia', password: 'a-strong-password' }, { auth: false });
  expect(res.status).toBe(200);
  const set = res.headers.get('set-cookie')!;
  expect(set).toContain('__Host-hpl_session=');
  expect(set).toContain('HttpOnly');
  cookie = set.split(';')[0];
});

describe('attribution (licence requirement)', () => {
  it('appears on the landing page, error pages and response headers', async () => {
    const home = await call('/');
    expect(home.status).toBe(200);
    expectAttribution(await home.text());
    expect(home.headers.get('link')).toContain('https://kitgenix.com');
    expect(home.headers.get('link')).toContain('https://github.com/Kitgenix');

    const missing = await call('/does-not-exist');
    expect(missing.status).toBe(404);
    expectAttribution(await missing.text());
  });

  it('is part of the dashboard source', async () => {
    const files = import.meta.glob('../src/client/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const attribution = files['../src/client/components/Attribution.tsx'];
    expect(attribution).toContain('KITGENIX.website');
    expect(attribution).toContain('KITGENIX.github');
    expect(files['../src/client/components/Layout.tsx']).toContain('<Attribution');
    expect(files['../src/client/pages/Auth.tsx']).toContain('<Attribution');
  });
});

describe('auth', () => {
  it('refuses a second setup and supports login', async () => {
    const again = await post('/api/auth/setup', { token: 'test-setup-token-123', email: 'x@example.com', password: 'a-strong-password' }, { auth: false });
    expect(again.status).toBe(409);
    expect((await post('/api/auth/login', { email: 'owner@example.com', password: 'nope-nope-nope' }, { auth: false })).status).toBe(401);
    const ok = await post('/api/auth/login', { email: 'owner@example.com', password: 'a-strong-password' }, { auth: false });
    expect(ok.status).toBe(200);
    const me = await json(await call('/api/auth/me'));
    expect(me).toMatchObject({ email: 'owner@example.com', role: 'owner', name: 'Olivia' });
  });

  it('requires auth for the API and blocks cross-site writes', async () => {
    expect((await call('/api/links', { auth: false })).status).toBe(401);
    const csrf = await post('/api/links', { url: 'https://example.com' }, { headers: { origin: 'https://evil.test' } });
    expect(csrf.status).toBe(403);
  });
});

describe('links & redirects', () => {
  it('creates links with validation', async () => {
    const res = await post('/api/links', { url: 'https://example.com/landing', slug: 'Hello', title: 'Hello page', tags: ['launch', 'launch', 'q4'] });
    expect(res.status).toBe(201);
    const link = await json(res);
    expect(link.slug).toBe('hello');
    expect(link.tags).toEqual(['launch', 'q4']);
    expect(link.short_url).toBe(`${ORIGIN}/hello`);

    expect((await post('/api/links', { url: 'https://example.com', slug: 'hello' })).status).toBe(409);
    expect((await post('/api/links', { url: 'https://example.com', slug: 'api' })).status).toBe(400);
    expect((await post('/api/links', { url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await post('/api/links', { url: `${ORIGIN}/loop` })).status).toBe(400);

    const auto = await json(await post('/api/links', { url: 'https://example.org' }));
    expect(auto.slug).toMatch(/^[a-z2-9]{6}$/);
  });

  it('redirects, records the click, and uses the KV cache', async () => {
    const res = await call('/hello?ref=newsletter');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://example.com/landing?ref=newsletter');
    expect(res.headers.get('cache-control')).toContain('no-store');

    const link = await json(await call('/api/links/lookup?slug=hello'));
    expect(link.clicks).toBe(1);
    expect(await env.CACHE!.get('link:hello')).not.toBeNull();

    // Updating purges the cache so the new destination applies immediately.
    await call(`/api/links/${link.id}`, { method: 'PATCH', body: JSON.stringify({ url: 'https://example.com/v2', utm: { source: 'kg', medium: 'link' } }) });
    const res2 = await call('/HELLO');
    expect(res2.headers.get('location')).toBe('https://example.com/v2?utm_source=kg&utm_medium=link');
  });

  it('does not count bots, and marks QR scans', async () => {
    await call('/hello', { headers: { 'user-agent': 'curl/8.4.0' } });
    await call('/hello?qr');
    const link = await json(await call('/api/links/lookup?slug=hello'));
    expect(link.clicks).toBe(3); // 2 earlier humans + 1 QR, not the bot
    const sum = await json(await call(`/api/analytics/summary?link=hello`));
    expect(sum.qr).toBe(1);
  });

  it('serves Open Graph previews to social crawlers', async () => {
    await post('/api/links', { url: 'https://example.com/og', slug: 'og', title: 'Big launch', description: 'Come see', image: 'https://example.com/card.png' });
    const res = await call('/og', { headers: { 'user-agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<meta property="og:title" content="Big launch">');
    expect(html).toContain('https://example.com/card.png');
    expectAttribution(html);
  });

  it('protects links with a password', async () => {
    await post('/api/links', { url: 'https://secret.example.com', slug: 'secret', password: 'opensesame' });
    const page = await call('/secret');
    expect(page.status).toBe(200);
    expectAttribution(await page.text());
    const form = (pw: string) => call('/secret', { method: 'POST', body: new URLSearchParams({ password: pw }), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect((await form('wrong')).status).toBe(401);
    const ok = await form('opensesame');
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe('https://secret.example.com/');
  });

  it('handles expiry, fallback, click limits and scheduling', async () => {
    const past = Date.now() - 1000;
    await post('/api/links', { url: 'https://a.example.com', slug: 'gone', starts_at: past - 10_000, expires_at: past });
    expect((await call('/gone')).status).toBe(410);
    await post('/api/links', { url: 'https://a.example.com', slug: 'gone2', expires_at: past - 1, starts_at: past - 10_000, expired_url: 'https://fallback.example.com' });
    expect((await call('/gone2')).headers.get('location')).toBe('https://fallback.example.com/');

    await post('/api/links', { url: 'https://a.example.com', slug: 'once', max_clicks: 1 });
    expect((await call('/once')).status).toBe(302);
    expect((await call('/once')).status).toBe(410);

    await post('/api/links', { url: 'https://a.example.com', slug: 'soon', starts_at: Date.now() + 86_400_000 });
    expect((await call('/soon')).status).toBe(404);
  });

  it('routes by device and country', async () => {
    await post('/api/links', {
      url: 'https://default.example.com',
      slug: 'app',
      rules: [
        { field: 'country', op: 'in', values: ['DE'], url: 'https://de.example.com' },
        { field: 'device', values: ['mobile'], url: 'https://m.example.com' },
      ],
    });
    expect((await call('/app')).headers.get('location')).toBe('https://default.example.com/');
    expect((await call('/app', { headers: { 'user-agent': IPHONE } })).headers.get('location')).toBe('https://m.example.com/');
    expect((await call('/app', { cf: { country: 'DE' } })).headers.get('location')).toBe('https://de.example.com/');
  });

  it('shows a warning page when enabled', async () => {
    await post('/api/links', { url: 'https://unknown.example.com/x', slug: 'careful', warning: true });
    const res = await call('/careful');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('https://unknown.example.com/x');
    expectAttribution(html);
  });

  it('lists, filters, bulk-edits and deletes', async () => {
    const list = await json(await call('/api/links?tag=launch'));
    expect(list.items.map((l: { slug: string }) => l.slug)).toEqual(['hello']);
    const expired = await json(await call('/api/links?status=expired'));
    expect(expired.items.map((l: { slug: string }) => l.slug).sort()).toEqual(['gone', 'gone2']);
    const ids = expired.items.map((l: { id: string }) => l.id);
    const bulk = await json(await post('/api/links/bulk', { action: 'delete', ids }));
    expect(bulk.affected).toBe(2);
    expect((await call('/gone')).status).toBe(404);
  });
});

describe('analytics', () => {
  it('summarises, breaks down and streams clicks', async () => {
    const sum = await json(await call('/api/analytics/summary'));
    expect(sum.clicks).toBeGreaterThanOrEqual(4);
    expect(sum.visitors).toBeGreaterThanOrEqual(1);
    const ts = await json(await call('/api/analytics/timeseries?interval=day'));
    expect(ts.points.length).toBeGreaterThanOrEqual(7);
    expect(ts.points.reduce((s: number, p: { clicks: number }) => s + p.clicks, 0)).toBe(sum.clicks);
    const devices = await json(await call('/api/analytics/breakdown?dimension=device'));
    expect(devices.items.map((d: { key: string }) => d.key)).toContain('mobile');
    const live = await json(await call('/api/analytics/live'));
    expect(live.items[0]).toHaveProperty('slug');
    const csv = await (await call('/api/analytics/export')).text();
    expect(csv.split('\r\n')[0]).toContain('time,slug,country');
    expect((await call('/api/analytics/breakdown?dimension=nope')).status).toBe(400);
  });
});

describe('API keys, roles and MCP', () => {
  let readKey = '';
  let writeKey = '';

  it('creates scoped API keys', async () => {
    readKey = (await json(await post('/api/keys', { name: 'reader', scopes: ['links:read'] }))).key;
    writeKey = (await json(await post('/api/keys', { name: 'writer', scopes: ['links:read', 'links:write', 'analytics:read'] }))).key;
    expect(readKey).toMatch(/^hpl_/);
    expect((await call('/api/links', { auth: readKey })).status).toBe(200);
    expect((await post('/api/links', { url: 'https://example.com' }, { auth: readKey })).status).toBe(403);
    expect((await call('/api/analytics/summary', { auth: readKey })).status).toBe(403);
    expect((await call('/api/users', { auth: writeKey })).status).toBe(403); // admin needs a session
    expect((await call('/api/links', { auth: 'hpl_invalid' })).status).toBe(401);
  });

  it('enforces roles', async () => {
    expect((await post('/api/users', { email: 'viewer@example.com', role: 'viewer', password: 'viewer-password' })).status).toBe(201);
    const login = await post('/api/auth/login', { email: 'viewer@example.com', password: 'viewer-password' }, { auth: false });
    const viewerCookie = login.headers.get('set-cookie')!.split(';')[0];
    const asViewer = (p: string, init: RequestInit = {}) => call(p, { ...init, auth: false, headers: { cookie: viewerCookie, 'content-type': 'application/json' } });
    expect((await asViewer('/api/links')).status).toBe(200);
    expect((await asViewer('/api/links', { method: 'POST', body: JSON.stringify({ url: 'https://example.com' }) })).status).toBe(403);
    expect((await asViewer('/api/users')).status).toBe(403);
  });

  it('speaks MCP', async () => {
    const rpc = (body: unknown, key = writeKey) => post('/api/mcp', body, { auth: key });
    const init = await json(await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }));
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.serverInfo.websiteUrl).toBe('https://kitgenix.com/hoplane');
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);

    const tools = await json(await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
    expect(tools.result.tools.map((t: { name: string }) => t.name)).toContain('create_link');
    const readTools = await json(await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, readKey));
    expect(readTools.result.tools.map((t: { name: string }) => t.name)).not.toContain('create_link');

    const created = await json(await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'create_link', arguments: { url: 'https://mcp.example.com', slug: 'from-ai' } } }));
    expect(created.result.structuredContent.short_url).toBe(`${ORIGIN}/from-ai`);
    const stats = await json(await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_analytics', arguments: { days: 7 } } }));
    expect(stats.result.structuredContent.totals.clicks).toBeGreaterThan(0);
    const bad = await json(await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'create_link', arguments: { url: 'ftp://x' } } }));
    expect(bad.result.isError).toBe(true);
  });

  it('counts and upserts links over MCP', async () => {
    const tool = async (name: string, args: Record<string, unknown>) =>
      (await json(await post('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { auth: writeKey }))).result;

    const first = await tool('upsert_link', { slug: 'upserted', url: 'https://one.example.com' });
    expect(first.structuredContent).toMatchObject({ action: 'created', link: { slug: 'upserted', url: 'https://one.example.com/' } });
    const second = await tool('upsert_link', { slug: 'upserted', url: 'https://two.example.com', tags: ['mcp-upsert'] });
    expect(second.structuredContent).toMatchObject({ action: 'updated', link: { url: 'https://two.example.com/', tags: ['mcp-upsert'] } });
    expect((await tool('upsert_link', { url: 'https://no-slug.example.com' })).isError).toBe(true);

    const counted = (await tool('count_links', { tag: 'mcp-upsert' })).structuredContent;
    expect(counted).toEqual({ total: 1, active: 1, scheduled: 0, expired: 0, limit: 0, disabled: 0 });
    const all = await json(await call('/api/links/count'));
    expect(all.total).toBe(all.active + all.scheduled + all.expired + all.limit + all.disabled);
    expect(all.total).toBe((await json(await call('/api/links?limit=1'))).total);
  });
});

describe('import / export / settings / maintenance', () => {
  it('imports from other formats and exports JSON', async () => {
    const res = await json(
      await post('/api/import', {
        links: [
          { long_url: 'https://bitly-style.example.com', keyword: 'imported-1', tags: 'a, b' },
          { url: 'https://sink-style.example.com', slug: 'imported-2', comment: 'from sink', expiration: Math.floor(Date.now() / 1000) + 3600 },
          { url: 'not-a-url', slug: 'broken' },
          { url: 'https://dupe.example.com', slug: 'hello' },
        ],
      }),
    );
    expect(res).toMatchObject({ created: 2, skipped: 1 });
    expect(res.errors).toHaveLength(1);
    const two = await json(await call('/api/links/lookup?slug=imported-2'));
    expect(two.notes).toBe('from sink');
    expect(two.expires_at).toBeGreaterThan(Date.now());

    const exported = await json(await call('/api/export?format=json'));
    expect(exported.format).toBe('hoplane');
    expect(exported.source).toBe('https://github.com/kitgenix/hoplane');
    expect(JSON.stringify(exported)).not.toContain('password_hash');
  });

  it('imports Sink exports with routing, query and password settings intact', async () => {
    const created = 1_700_000_000;
    const res = await json(
      await post('/api/import', {
        links: [
          {
            id: 's1', slug: 'sink-full', url: 'https://sink.example.com/', comment: 'from sink', createdAt: created, updatedAt: created, tags: ['x'],
            geo: { DE: 'https://de.sink.example.com/', AT: 'https://de.sink.example.com/' },
            apple: 'https://apps.apple.com/app/id1',
            image: '/_assets/images/s1.png',
            cloaking: true,
          },
          { id: 's2', slug: 'sink-locked', url: 'https://locked.example.com/', createdAt: created, updatedAt: created, password: await sinkHash('hunter22') },
          { id: 's3', slug: 'sink-masked', url: 'https://masked.example.com/', createdAt: created, updatedAt: created, password: '__SINK_MASKED__•••r22' },
        ],
      }),
    );
    expect(res).toMatchObject({ created: 2, skipped: 0 });
    expect(res.errors).toEqual([expect.objectContaining({ row: 3, error: expect.stringMatching(/masked password/) })]);
    expect(res.warnings.map((w: { slug: string }) => w.slug)).toEqual(['sink-full', 'sink-full']);

    // Country routing; Sink's default of not forwarding the query string is kept.
    expect((await call('/sink-full?ref=x', { cf: { country: 'AT' } })).headers.get('location')).toBe('https://de.sink.example.com/');
    // Device routing beats country routing, as in Sink.
    expect((await call('/sink-full', { cf: { country: 'DE' }, headers: { 'user-agent': IPHONE } })).headers.get('location')).toBe('https://apps.apple.com/app/id1');
    expect((await call('/sink-full', { cf: { country: 'US' } })).headers.get('location')).toBe('https://sink.example.com/');

    // The original Sink password still opens the link.
    const form = (pw: string) => call('/sink-locked', { method: 'POST', body: new URLSearchParams({ password: pw }), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect((await form('wrong')).status).toBe(401);
    const ok = await form('hunter22');
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe('https://locked.example.com/');
  });

  it('applies the domain blocklist', async () => {
    await call('/api/settings', { method: 'PUT', body: JSON.stringify({ blocked_domains: ['blocked.example'] }) });
    expect((await post('/api/links', { url: 'https://sub.blocked.example/x' })).status).toBe(400);
    await call('/api/settings', { method: 'PUT', body: JSON.stringify({ blocked_domains: [] }) });
  });

  it('prunes old analytics and visitor salts', async () => {
    await env.DB.prepare("INSERT INTO clicks (link_id, ts, source) VALUES ('x', 1000, 'link')").run();
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('salt:2000-01-01', 'old')").run();
    const report = await runMaintenance(env);
    expect(report.clicksDeleted).toBe(1);
    expect(await env.DB.prepare("SELECT 1 FROM settings WHERE key = 'salt:2000-01-01'").first()).toBeNull();
  });

  it('writes an audit trail', async () => {
    const log = await json(await call('/api/audit'));
    const actions = log.items.map((e: { action: string }) => e.action);
    expect(actions).toContain('link.create');
    expect(actions).toContain('instance.setup');
  });
});

/** A D1 binding whose writes wait until `open()` is called, to show which requests block on a write. */
function gatedWrites(db: D1Database) {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const real = new WeakMap<object, D1PreparedStatement>();
  const writes = new WeakSet<object>();
  const wrap = (stmt: D1PreparedStatement, write: boolean): D1PreparedStatement => {
    const call = (method: 'first' | 'run' | 'all' | 'raw') => async (...args: unknown[]) => {
      if (write) await gate;
      return (stmt[method] as (...a: unknown[]) => unknown)(...args);
    };
    const proxy = { bind: (...args: unknown[]) => wrap(stmt.bind(...args), write), first: call('first'), run: call('run'), all: call('all'), raw: call('raw') };
    real.set(proxy, stmt);
    if (write) writes.add(proxy);
    return proxy as unknown as D1PreparedStatement;
  };
  const gated = {
    prepare: (sql: string) => wrap(db.prepare(sql), /^\s*(insert|update|delete)\b/i.test(sql)),
    batch: async (stmts: D1PreparedStatement[]) => {
      if (stmts.some((s) => writes.has(s))) await gate;
      return db.batch(stmts.map((s) => real.get(s) ?? s));
    },
  } as unknown as D1Database;
  return { db: gated, open };
}

describe('redirect latency', () => {
  /** Returns whether the response was held back by a pending D1 write. */
  async function visit(slug: string) {
    const { db, open } = gatedWrites(env.DB);
    const ctx = createExecutionContext();
    const req = new Request(`${ORIGIN}/${slug}`, { headers: { 'user-agent': BROWSER }, redirect: 'manual' });
    const pending = worker.fetch(req, { ...env, DB: db }, ctx);
    const early = await Promise.race([pending, new Promise<null>((resolve) => setTimeout(() => resolve(null), 250))]);
    open();
    const res = early ?? (await pending);
    await waitOnExecutionContext(ctx);
    return { blocked: early === null, status: res.status };
  }

  it('does not wait for a D1 write on uncapped links, but still counts the click', async () => {
    await post('/api/links', { url: 'https://fast.example.com', slug: 'fast' });
    await call('/fast'); // warm the KV cache and the visitor salt
    const before = (await json(await call('/api/links/lookup?slug=fast'))).clicks;
    expect(await visit('fast')).toEqual({ blocked: false, status: 302 });
    expect((await json(await call('/api/links/lookup?slug=fast'))).clicks).toBe(before + 1);
  });

  it('still reserves capped clicks atomically before redirecting', async () => {
    await post('/api/links', { url: 'https://capped.example.com', slug: 'capped', max_clicks: 5 });
    expect(await visit('capped')).toEqual({ blocked: true, status: 302 });
    expect((await json(await call('/api/links/lookup?slug=capped'))).clicks).toBe(1);
  });
});

describe('instance options and client access', () => {
  it('redirects unknown links to NOT_FOUND_URL when it is set', async () => {
    const missing = await call('/no-such-link', { bindings: { NOT_FOUND_URL: 'https://example.org/missing' } });
    expect(missing.status).toBe(302);
    expect(missing.headers.get('location')).toBe('https://example.org/missing');
    expect(missing.headers.get('cache-control')).toBe('no-store');
    // Existing links are unaffected.
    await post('/api/links', { url: 'https://present.example.com', slug: 'present' });
    expect((await call('/present', { bindings: { NOT_FOUND_URL: 'https://example.org/missing' } })).headers.get('location')).toBe('https://present.example.com/');
    // A target on the same path would loop, and an unsafe value is ignored.
    expect((await call('/gone', { bindings: { NOT_FOUND_URL: `${ORIGIN}/gone` } })).status).toBe(404);
    expect((await call('/no-such-link', { bindings: { NOT_FOUND_URL: 'javascript:alert(1)' } })).status).toBe(404);
    expect((await call('/no-such-link')).status).toBe(404);
  });

  it('opens protected links with an X-Link-Password header', async () => {
    await post('/api/links', { url: 'https://cli.example.com/install.sh', slug: 'cli-locked', password: 'opensesame', redirect_code: 301 });
    expect((await call('/cli-locked')).headers.get('content-type')).toContain('text/html');

    const wrong = await call('/cli-locked', { headers: { 'x-link-password': 'nope' } });
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('content-type')).toContain('text/plain');
    expect(await wrong.text()).toBe('Incorrect password');

    const ok = await call('/cli-locked', { headers: { 'x-link-password': 'opensesame' } });
    expect(ok.status).toBe(301);
    expect(ok.headers.get('location')).toBe('https://cli.example.com/install.sh');
    // Never cache a protected destination publicly, even on a permanent redirect.
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
  });

  it('deletes long-expired links only when EXPIRED_LINK_RETENTION_DAYS is set', async () => {
    const day = 86_400_000;
    const expired = Date.now() - 10 * day;
    await post('/api/links', { url: 'https://old.example.com', slug: 'old-expired', expires_at: expired });
    await post('/api/links', { url: 'https://old.example.com', slug: 'old-fallback', expires_at: expired, expired_url: 'https://fallback.example.com' });
    await post('/api/links', { url: 'https://old.example.com', slug: 'recent-expired', expires_at: Date.now() - day });
    const exists = async (slug: string) => (await call(`/api/links/lookup?slug=${slug}`)).status === 200;

    expect((await runMaintenance(env)).expiredLinksDeleted).toBe(0);
    expect(await exists('old-expired')).toBe(true);

    const report = await runMaintenance({ ...env, EXPIRED_LINK_RETENTION_DAYS: '7' });
    expect(report.expiredLinksDeleted).toBeGreaterThanOrEqual(1);
    expect(await exists('old-expired')).toBe(false);
    expect(await exists('old-fallback')).toBe(true); // still redirects to its fallback
    expect(await exists('recent-expired')).toBe(true);
    const log = await json(await call('/api/audit'));
    expect(log.items.some((e: { action: string; target: string }) => e.action === 'link.cleanup' && e.target.includes('old-expired'))).toBe(true);
  });

  it('applies bulk actions to more ids than D1 allows parameters in one query', async () => {
    const links = Array.from({ length: 120 }, (_, i) => ({ url: `https://bulk.example.com/${i}`, slug: `bulk-${i}` }));
    expect((await json(await post('/api/import', { links }))).created).toBe(120);
    const listed = await json(await call('/api/links?q=bulk.example.com&limit=200'));
    const ids = listed.items.map((l: { id: string }) => l.id);
    expect(ids).toHaveLength(120);
    expect((await json(await post('/api/links/bulk', { action: 'disable', ids }))).affected).toBe(120);
    expect((await json(await post('/api/links/bulk', { action: 'delete', ids }))).affected).toBe(120);
    expect((await json(await call('/api/links?q=bulk.example.com'))).total).toBe(0);
  });
});

/** Replace global fetch for one test; `handler` receives the requested URL and init. */
function stubFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch);
  return { calls, restore: () => spy.mockRestore() };
}

describe('destination and update checks', () => {
  it('refuses destinations that Cloudflare security DNS blocks, when enabled', async () => {
    clearSafeBrowsingCache();
    const net = stubFetch((url) => {
      const name = url.searchParams.get('name');
      return Response.json({ Status: 0, Answer: [{ name, type: 1, data: name === 'phish.example' ? '0.0.0.0' : '203.0.113.7' }] });
    });
    try {
      // Off by default: no lookups at all.
      expect((await post('/api/links', { url: 'https://phish.example/login', slug: 'sb-off' })).status).toBe(201);
      expect(net.calls).toHaveLength(0);

      await call('/api/settings', { method: 'PUT', body: JSON.stringify({ safe_browsing: true }) });
      const bad = await post('/api/links', { url: 'https://phish.example/login', slug: 'sb-bad' });
      expect(bad.status).toBe(400);
      expect((await json(bad)).error).toMatch(/phish\.example.*malware or phishing/);
      // Routing-rule destinations are checked too.
      const viaRule = await post('/api/links', { url: 'https://fine.example', slug: 'sb-rule', rules: [{ field: 'country', op: 'in', values: ['DE'], url: 'https://phish.example/de' }] });
      expect(viaRule.status).toBe(400);
      expect((await post('/api/links', { url: 'https://fine.example', slug: 'sb-ok' })).status).toBe(201);
      expect(net.calls.every((c) => c.url.origin === 'https://security.cloudflare-dns.com')).toBe(true);
    } finally {
      net.restore();
      await call('/api/settings', { method: 'PUT', body: JSON.stringify({ safe_browsing: false }) });
    }
  });

  it('records the latest release daily and reports it to admins', async () => {
    const on = { UPDATE_CHECK: 'true' };
    const net = stubFetch(() => Response.json({ tag_name: 'v99.0.0', html_url: 'https://github.com/kitgenix/hoplane/releases/tag/v99.0.0' }));
    try {
      expect((await runMaintenance({ ...env, ...on })).updateCheck).toBe('ok');
      expect(net.calls[0].url.href).toBe('https://api.github.com/repos/kitgenix/hoplane/releases/latest');
      expect(new Headers(net.calls[0].init?.headers).get('user-agent')).toBe('Hoplane/1.0.0');
    } finally {
      net.restore();
    }
    const status = await json(await call('/api/updates', { bindings: on }));
    expect(status).toMatchObject({ enabled: true, current: '1.0.0', latest: '99.0.0', update_available: true });
    // With checks turned off the banner stays hidden and "Check now" is refused.
    expect((await json(await call('/api/updates'))).update_available).toBe(false);
    expect((await call('/api/updates/check', { method: 'POST', bindings: { UPDATE_CHECK: 'false' } })).status).toBe(400);
    // The daily run skips GitHub entirely when off.
    expect((await runMaintenance(env)).updateCheck).toBe('off');
  });

  it('handles "no release yet" and GitHub errors from Check now', async () => {
    const on = { UPDATE_CHECK: 'true' };
    let net = stubFetch(() => new Response('Not Found', { status: 404 }));
    try {
      const none = await json(await call('/api/updates/check', { method: 'POST', bindings: on }));
      expect(none).toMatchObject({ latest: null, update_available: false });
      expect(none.checked_at).toBeGreaterThan(0);
    } finally {
      net.restore();
    }
    net = stubFetch(() => new Response('rate limited', { status: 403 }));
    try {
      expect((await call('/api/updates/check', { method: 'POST', bindings: on })).status).toBe(502);
      expect((await runMaintenance({ ...env, ...on })).updateCheck).toBe('failed');
    } finally {
      net.restore();
    }
  });

  it('keeps the update status for admins only', async () => {
    const key = (await json(await post('/api/keys', { name: 'updates-probe', scopes: ['links:read'] }))).key;
    expect((await call('/api/updates', { auth: key })).status).toBe(403);
    expect((await call('/api/updates', { auth: false })).status).toBe(401);
  });
});

describe('translated visitor pages', () => {
  const lang = (value: string) => ({ headers: { 'accept-language': value } });

  it('serves error pages in the visitor language', async () => {
    const de = await call('/nope-not-here', lang('de-DE,de;q=0.9,en;q=0.5'));
    expect(de.status).toBe(404);
    expect(de.headers.get('content-language')).toBe('de');
    expect(de.headers.get('vary')).toContain('Accept-Language');
    const html = await de.text();
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('Link nicht gefunden');
    expectAttribution(html); // the licence footer is never translated away

    const en = await call('/nope-not-here');
    expect(await en.text()).toContain('Link not found');
    expect(en.headers.get('content-language')).toBe('en');
  });

  it('translates the password form and its errors', async () => {
    await post('/api/links', { url: 'https://fr.example.com', slug: 'fr-locked', password: 'motdepasse' });
    expect(await (await call('/fr-locked', lang('fr-FR'))).text()).toContain('Ce lien nécessite un mot de passe');
    const wrong = await call('/fr-locked', {
      method: 'POST',
      body: new URLSearchParams({ password: 'non' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept-language': 'fr' },
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain("Ce mot de passe n&#39;est pas correct.");
  });

  it('translates the warning page and keeps the destination escaped', async () => {
    await post('/api/links', { url: 'https://warn.example.com/path?a=<b>', slug: 'ja-warn', warning: true });
    const html = await (await call('/ja-warn', lang('ja'))).text();
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<span dir="ltr">warn.example.com</span> に移動しようとしています');
    expect(html).toContain('サイトへ移動');
    expect(html).not.toContain('<b>');
  });
});

describe('link health checks', () => {
  const lookup = async (slug: string) => json(await call(`/api/links/lookup?slug=${slug}`));

  it('checks destinations daily when enabled and surfaces problems', async () => {
    await post('/api/links', { url: 'https://healthy.example.com/', slug: 'hc-ok' });
    await post('/api/links', { url: 'https://healthy.example.com/', slug: 'hc-broken', rules: [{ field: 'country', op: 'in', values: ['FR'], url: 'https://gone.example.com/' }] });
    const net = stubFetch((url) => new Response(null, { status: url.hostname === 'gone.example.com' ? 404 : 200 }));
    try {
      // Off by default: nothing is fetched.
      expect((await runMaintenance(env)).health).toBe('off');
      expect(net.calls).toHaveLength(0);

      await call('/api/settings', { method: 'PUT', body: JSON.stringify({ health_checks: true }) });
      const report = await runMaintenance({ ...env, HEALTH_CHECK_REQUESTS: '2000' });
      expect(report.health).toMatchObject({ problems: 1 });
      expect((await lookup('hc-ok')).health).toMatchObject({ status: 'ok', http_status: 200 });
      expect((await lookup('hc-broken')).health).toMatchObject({ status: 'broken', http_status: 404, target: 'https://gone.example.com/' });

      const attention = await json(await call('/api/links?health=problems&limit=200'));
      expect(attention.items.map((l: { slug: string }) => l.slug)).toEqual(['hc-broken']);

      // Links checked within the last day are not fetched again.
      const before = net.calls.length;
      expect(await runMaintenance({ ...env, HEALTH_CHECK_REQUESTS: '2000' })).toMatchObject({ health: { checked: 0 } });
      expect(net.calls.length).toBe(before);
    } finally {
      net.restore();
      await call('/api/settings', { method: 'PUT', body: JSON.stringify({ health_checks: false }) });
    }
  });

  it('clears a stale result when destinations change, and can check on demand', async () => {
    const broken = await lookup('hc-broken');
    const edited = await json(await call(`/api/links/${broken.id}`, { method: 'PATCH', body: JSON.stringify({ rules: [] }) }));
    expect(edited.health).toBeNull();
    const net = stubFetch(() => new Response(null, { status: 200 }));
    try {
      const checked = await json(await post(`/api/links/${broken.id}/health`, {}));
      expect(checked.health).toMatchObject({ status: 'ok' });
    } finally {
      net.restore();
    }
  });

  it('respects the request budget', async () => {
    await call('/api/settings', { method: 'PUT', body: JSON.stringify({ health_checks: true }) });
    await post('/api/links', { url: 'https://budget.example.com/', slug: 'hc-budget' });
    const net = stubFetch(() => new Response(null, { status: 200 }));
    try {
      await runMaintenance({ ...env, HEALTH_CHECK_REQUESTS: '3' });
      expect(net.calls.length).toBeLessThanOrEqual(3);
    } finally {
      net.restore();
      await call('/api/settings', { method: 'PUT', body: JSON.stringify({ health_checks: false }) });
    }
  });
});

describe('webhooks', () => {
  type Sent = { type: string; data: Record<string, any>; headers: Headers; body: string };
  /** Capture deliveries to hooks.example.com; anything else gets a 200. */
  function receiver(status = 200) {
    const sent: Sent[] = [];
    const net = stubFetch((url, init) => {
      if (url.hostname === 'hooks.example.com') {
        const body = String(init?.body);
        sent.push({ ...JSON.parse(body), headers: new Headers(init?.headers), body });
      }
      return new Response(null, { status: url.hostname === 'hooks.example.com' ? status : 200 });
    });
    return { sent, restore: net.restore };
  }

  it('manages endpoints and only reveals the secret once', async () => {
    expect((await post('/api/webhooks', { url: 'http://hooks.example.com/in', events: ['link.created'] })).status).toBe(400);
    expect((await post('/api/webhooks', { url: 'https://hooks.example.com/in', events: [] })).status).toBe(400);
    const created = await json(await post('/api/webhooks', { url: 'https://hooks.example.com/in', events: ['link.created'] }));
    expect(created.secret).toMatch(/^whsec_/);
    const list = await json(await call('/api/webhooks'));
    expect(list.queue).toBe(false);
    expect(JSON.stringify(list)).not.toContain(created.secret);
    expect(list.items[0].secret_hint).toBe(`${created.secret.slice(0, 10)}…`);

    const rotated = await json(await post(`/api/webhooks/${created.id}/rotate`, {}));
    expect(rotated.secret).not.toBe(created.secret);
    const key = (await json(await post('/api/keys', { name: 'hooks-probe', scopes: ['links:write'] }))).key;
    expect((await call('/api/webhooks', { auth: key })).status).toBe(403);
    expect((await call(`/api/webhooks/${created.id}`, { method: 'DELETE' })).status).toBe(200);
  });

  it('delivers signed link events to subscribed endpoints', async () => {
    const hook = await json(await post('/api/webhooks', { url: 'https://hooks.example.com/in', events: ['link.created', 'link.updated', 'link.deleted', 'link.clicked'] }));
    const rx = receiver();
    try {
      const link = await json(await post('/api/links', { url: 'https://events.example.com/', slug: 'wh-events', password: 'secret-pass-1', notes: 'n' }));
      await call(`/api/links/${link.id}`, { method: 'PATCH', body: JSON.stringify({ title: 'Renamed' }) });
      await call('/wh-events', { method: 'POST', body: new URLSearchParams({ password: 'secret-pass-1' }), headers: { 'content-type': 'application/x-www-form-urlencoded' }, cf: { country: 'GB', city: 'Leeds', latitude: '53.8', longitude: '-1.5' } });
      await post('/api/links/bulk', { action: 'disable', ids: [link.id] });
      await call(`/api/links/${link.id}`, { method: 'DELETE' });

      expect(rx.sent.map((s) => s.type)).toEqual(['link.created', 'link.updated', 'link.clicked', 'link.updated', 'link.deleted']);
      const [createdEvt, updatedEvt, clickEvt, disabledEvt, deletedEvt] = rx.sent;
      expect(createdEvt.data.link).toMatchObject({ slug: 'wh-events', has_password: true });
      expect(createdEvt.body).not.toContain('secret-pass-1');
      expect(createdEvt.body).not.toContain('password_hash');
      expect(updatedEvt.data.link.title).toBe('Renamed');
      expect(clickEvt.data).toMatchObject({ link: { slug: 'wh-events' }, click: { country: 'GB', city: 'Leeds', source: 'link' } });
      for (const field of ['ip', 'ua', 'latitude', 'longitude', 'visitor']) expect(clickEvt.data.click).not.toHaveProperty(field);
      expect(disabledEvt.data.link.disabled).toBe(true);
      expect(deletedEvt.data).toEqual({ link: { id: link.id, slug: 'wh-events' } });

      // The signature verifies with the secret returned when the endpoint was created.
      const { sign } = await import('../src/worker/services/webhooks');
      const h = createdEvt.headers;
      expect(h.get('webhook-signature')).toBe(await sign(h.get('webhook-id')!, Number(h.get('webhook-timestamp')), createdEvt.body, hook.secret));

      // Disabled endpoints receive nothing.
      await call(`/api/webhooks/${hook.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: false }) });
      const before = rx.sent.length;
      await post('/api/links', { url: 'https://events.example.com/', slug: 'wh-quiet' });
      expect(rx.sent.length).toBe(before);
    } finally {
      rx.restore();
      await call(`/api/webhooks/${hook.id}`, { method: 'DELETE' });
    }
  });

  it('queues deliveries when WEBHOOK_QUEUE is bound, and records failed test sends', async () => {
    const hook = await json(await post('/api/webhooks', { url: 'https://hooks.example.com/in', events: ['link.created'] }));
    const queued: { body: { webhook_id: string; event: { type: string } } }[] = [];
    const queue = { send: async () => {}, sendBatch: async (msgs: typeof queued) => void queued.push(...msgs) };
    const rx = receiver(500);
    try {
      await post('/api/links', { url: 'https://events.example.com/', slug: 'wh-queued' }, { bindings: { WEBHOOK_QUEUE: queue as never } });
      expect(queued).toHaveLength(1);
      expect(queued[0].body).toMatchObject({ webhook_id: hook.id, event: { type: 'link.created' } });
      expect(rx.sent).toHaveLength(0); // queued, not sent directly

      const result = await json(await post(`/api/webhooks/${hook.id}/test`, {}));
      expect(result).toMatchObject({ ok: false, status: 500 });
      expect(rx.sent[0].type).toBe('webhook.test');
      const listed = (await json(await call('/api/webhooks'))).items.find((w: { id: string }) => w.id === hook.id);
      expect(listed).toMatchObject({ failures: 1, last_status: 500 });
    } finally {
      rx.restore();
      await call(`/api/webhooks/${hook.id}`, { method: 'DELETE' });
    }
  });
});

describe('OpenAPI endpoint', () => {
  it('is served publicly with this instance as the server', async () => {
    const res = await call('/api/openapi.json', { auth: false });
    expect(res.status).toBe(200);
    const doc = await json(res);
    expect(doc.servers).toEqual([{ url: ORIGIN }]);
    expect(doc.paths['/api/links'].post.requestBody).toBeTruthy();
  });
});

describe('Cloudflare Access sign-in', () => {
  const access = { ACCESS_TEAM_DOMAIN: 'hoplane-test.cloudflareaccess.com', ACCESS_AUD: 'a1b2c3d4e5f6' };

  async function withAccess<T>(run: (key: Awaited<ReturnType<typeof accessKey>>) => Promise<T>) {
    clearAccessKeyCache();
    const key = await accessKey();
    const net = stubFetch((url) => (url.pathname === '/cdn-cgi/access/certs' ? Response.json({ keys: [key.jwk] }) : new Response(null, { status: 404 })));
    try {
      return await run(key);
    } finally {
      net.restore();
    }
  }
  const signIn = (token: string | null, bindings: Partial<Bindings> = access) =>
    call('/api/auth/access', { auth: false, bindings, headers: token ? { 'cf-access-jwt-assertion': token } : {} });

  it('is advertised only when configured', async () => {
    expect((await json(await call('/api/instance', { auth: false }))).access_login).toBe(false);
    expect((await json(await call('/api/instance', { auth: false, bindings: access }))).access_login).toBe(true);
    expect((await signIn('x', {})).headers.get('location')).toBe('/dashboard/login?access_error=not_configured');
  });

  it('signs in an existing user with a session that ends with the Access token', async () => {
    await withAccess(async (key) => {
      const exp = Math.floor(Date.now() / 1000) + 1800;
      const res = await signIn(await accessJwt(key, { email: 'OWNER@example.com', exp }));
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/dashboard');
      const setCookie = res.headers.get('set-cookie')!;
      const maxAge = Number(/Max-Age=(\d+)/i.exec(setCookie)![1]);
      expect(maxAge).toBeGreaterThan(1700);
      expect(maxAge).toBeLessThanOrEqual(1800);
      const me = await json(await call('/api/auth/me', { auth: false, headers: { cookie: setCookie.split(';')[0] } }));
      expect(me).toMatchObject({ email: 'owner@example.com', role: 'owner', via: 'session' });
    });
  });

  it('refuses unknown people and forged tokens unless auto-provisioning is on', async () => {
    await withAccess(async (key) => {
      expect((await signIn(null)).headers.get('location')).toBe('/dashboard/login?access_error=no_token');
      const forged = await accessJwt(await accessKey(), { email: 'owner@example.com' });
      expect((await signIn(forged)).headers.get('location')).toBe('/dashboard/login?access_error=invalid_token');

      const stranger = await accessJwt(key, { email: 'new.person@example.com' });
      expect((await signIn(stranger)).headers.get('location')).toBe('/dashboard/login?access_error=no_account');
      // "owner" and "admin" are not accepted as automatic roles.
      expect((await signIn(stranger, { ...access, ACCESS_AUTO_ROLE: 'admin' })).headers.get('location')).toBe('/dashboard/login?access_error=no_account');

      const created = await signIn(stranger, { ...access, ACCESS_AUTO_ROLE: 'viewer' });
      expect(created.headers.get('location')).toBe('/dashboard');
      const me = await json(await call('/api/auth/me', { auth: false, headers: { cookie: created.headers.get('set-cookie')!.split(';')[0] } }));
      expect(me).toMatchObject({ email: 'new.person@example.com', role: 'viewer' });
    });
  });
});
