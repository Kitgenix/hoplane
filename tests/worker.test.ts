import { createExecutionContext, env as testEnv, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { runMaintenance } from '../src/worker/cron';
import type { Bindings } from '../src/worker/env';
import worker from '../src/worker/index';

const env = testEnv as unknown as Bindings;
const ORIGIN = 'https://links.test';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let cookie = '';

async function call(path: string, init: RequestInit & { cf?: Record<string, unknown>; auth?: string | false } = {}) {
  const headers = new Headers(init.headers);
  if (init.auth) headers.set('authorization', `Bearer ${init.auth}`);
  else if (init.auth !== false && cookie) headers.set('cookie', cookie);
  if (!headers.has('user-agent')) headers.set('user-agent', BROWSER);
  if (init.body && typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const req = new Request(ORIGIN + path, { ...init, headers, redirect: 'manual', cf: init.cf } as RequestInit);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
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
