import { describe, expect, it } from 'vitest';
import { clearSafeBrowsingCache } from '../src/worker/lib/safe-browsing';
import { checkDestination, checkLink, destinationsOf, type Budget } from '../src/worker/services/health';

/** A fake internet: each URL maps to a status, or a redirect (`→ url`), or an error. */
function web(routes: Record<string, number | string | Error>, calls: string[] = []) {
  return async (input: string) => {
    calls.push(input);
    const url = new URL(input);
    if (url.hostname === 'security.cloudflare-dns.com') {
      const name = url.searchParams.get('name');
      return Response.json({ Status: 0, Answer: [{ name, type: 1, data: name === 'malware.example.com' ? '0.0.0.0' : '198.51.100.1' }] });
    }
    const route = routes[input] ?? 200;
    if (route instanceof Error) throw route;
    if (typeof route === 'string') return new Response(null, { status: 302, headers: { location: route } });
    return new Response('body', { status: route });
  };
}
const budget = (n = 50): Budget => ({ remaining: n });

describe('destination checks', () => {
  it('classifies responses', async () => {
    const f = web({ 'https://gone.example.com/': 404, 'https://down.example.com/': 503, 'https://guarded.example.com/': 403 });
    expect((await checkDestination('https://ok.example.com/', budget(), f))?.status).toBe('ok');
    expect(await checkDestination('https://gone.example.com/', budget(), f)).toMatchObject({ status: 'broken', http_status: 404 });
    expect(await checkDestination('https://down.example.com/', budget(), f)).toMatchObject({ status: 'warning', http_status: 503 });
    expect((await checkDestination('https://guarded.example.com/', budget(), f))?.error).toMatch(/block automated checks/);
  });

  it('follows redirects, re-checking each hop', async () => {
    const calls: string[] = [];
    const f = web({ 'https://a.example.com/': 'https://b.example.com/x', 'https://b.example.com/x': 410 }, calls);
    expect(await checkDestination('https://a.example.com/', budget(), f)).toMatchObject({ status: 'broken', http_status: 410, target: 'https://a.example.com/' });
    expect(calls).toEqual(['https://a.example.com/', 'https://b.example.com/x']);
    const toPrivate = web({ 'https://c.example.com/': 'http://127.0.0.1/admin' });
    expect((await checkDestination('https://c.example.com/', budget(), toPrivate))?.status).toBe('skipped');
  });

  it('never requests non-public addresses', async () => {
    const calls: string[] = [];
    for (const url of ['http://127.0.0.1/', 'http://localhost/', 'https://intranet.local/', 'https://example.com:8443/']) {
      expect((await checkDestination(url, budget(), web({}, calls)))?.status).toBe('skipped');
    }
    expect(calls).toEqual([]);
  });

  it('reports network failures as unreachable', async () => {
    const f = web({ 'https://nx.example.com/': new TypeError('connect failed') });
    expect(await checkDestination('https://nx.example.com/', budget(), f)).toMatchObject({ status: 'unreachable', http_status: null });
  });

  it('stops when the request budget is used up', async () => {
    const b = budget(1);
    expect(await checkDestination('https://a.example.com/', b, web({ 'https://a.example.com/': 'https://b.example.com/' }))).toBeNull();
    expect(b.remaining).toBe(0);
  });
});

describe('link checks', () => {
  const row = (extra: Partial<{ rules: string; variants: string; expired_url: string | null }> = {}) => ({
    url: 'https://main.example.com/',
    rules: '[]',
    variants: '[]',
    expired_url: null,
    ...extra,
  });

  it('collects every distinct destination', () => {
    expect(destinationsOf(row({
      rules: JSON.stringify([{ url: 'https://de.example.com/' }, { url: 'https://main.example.com/' }]),
      variants: JSON.stringify([{ url: 'https://b.example.com/', weight: 1 }]),
      expired_url: 'https://after.example.com/',
    }))).toEqual(['https://main.example.com/', 'https://de.example.com/', 'https://b.example.com/', 'https://after.example.com/']);
  });

  it('reports the worst destination', async () => {
    const r = row({ rules: JSON.stringify([{ url: 'https://gone.example.com/' }]) });
    const result = await checkLink(r, budget(), { safeBrowsing: false, fetcher: web({ 'https://gone.example.com/': 404 }) });
    expect(result).toMatchObject({ status: 'broken', target: 'https://gone.example.com/' });
  });

  it('flags malware hosts when safe browsing is on, without fetching them', async () => {
    clearSafeBrowsingCache();
    const calls: string[] = [];
    const r = row({ variants: JSON.stringify([{ url: 'https://malware.example.com/x', weight: 1 }]) });
    const result = await checkLink(r, budget(), { safeBrowsing: true, fetcher: web({}, calls) });
    expect(result).toMatchObject({ status: 'flagged', target: 'https://malware.example.com/x' });
    expect(calls.some((c) => c.startsWith('https://malware.example.com'))).toBe(false);
  });
});
