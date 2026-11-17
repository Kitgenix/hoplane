import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMeta, isSafeMetadataTarget } from '../src/worker/routes/links';

afterEach(() => vi.unstubAllGlobals());

describe('metadata outbound URL validation', () => {
  it.each([
    'http://localhost/dashboard',
    'https://foo.localhost/a',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://2130706433/',
    'http://10.0.0.2/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://metadata.google.internal/',
    'http://router.local/',
    'https://site.example.org:8080/',
    'ftp://site.example.org/',
    'https://user:pass@site.example.org/',
  ])('rejects non-public or unsupported destination %s', (url) => {
    expect(isSafeMetadataTarget(url)).toBe(false);
  });

  it('rejects its own origin, but permits an ordinary public hostname', () => {
    expect(isSafeMetadataTarget('https://go.example.org/meta', 'go.example.org')).toBe(false);
    expect(isSafeMetadataTarget('https://www.wikipedia.org/wiki/Example', 'go.example.org')).toBe(true);
  });
});

describe('metadata fetch redirects and response limits', () => {
  it('refuses a redirect to an unsafe host without fetching it', async () => {
    const mock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
    vi.stubGlobal('fetch', mock);
    expect(await fetchMeta('https://www.wikipedia.org/')).toEqual({ title: '', description: '', image: '', site_name: '' });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });

  it('follows a checked public redirect and parses metadata', async () => {
    const mock = vi.fn(async (url: string) => {
      if (url === 'https://public.example.org/')
        return new Response(null, { status: 302, headers: { location: '/article' } });
      return new Response('<html><head><title>Article title</title><meta name="description" content="Summary"></head><body>Hi</body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    });
    vi.stubGlobal('fetch', mock);
    const meta = await fetchMeta('https://public.example.org/');
    expect(meta.title).toBe('Article title');
    expect(meta.description).toBe('Summary');
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('ignores non-HTML responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"private":true}', { headers: { 'Content-Type': 'application/json' } })));
    expect((await fetchMeta('https://public.example.org/')).title).toBe('');
  });
});
