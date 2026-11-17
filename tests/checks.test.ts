import { describe, expect, it } from 'vitest';
import { clearSafeBrowsingCache, findFlaggedHost, isFlaggedHost } from '../src/worker/lib/safe-browsing';
import { compareVersions, updateStatus } from '../src/worker/services/updates';

/** A fake DoH endpoint: names in `blocked` resolve to 0.0.0.0, as Cloudflare's security resolver does. */
function doh(blocked: string[], calls: string[] = []) {
  return async (input: string) => {
    const name = new URL(input).searchParams.get('name')!;
    calls.push(name);
    const data = blocked.includes(name) ? '0.0.0.0' : '93.184.215.14';
    return Response.json({ Status: 0, Answer: [{ name, type: 1, data }] });
  };
}

describe('safe browsing', () => {
  it('flags hosts the resolver blocks and caches verdicts', async () => {
    clearSafeBrowsingCache();
    const calls: string[] = [];
    const fetcher = doh(['malware.testcategory.com'], calls);
    expect(await isFlaggedHost('Malware.TestCategory.com.', fetcher)).toBe(true);
    expect(await isFlaggedHost('example.com', fetcher)).toBe(false);
    expect(await isFlaggedHost('malware.testcategory.com', fetcher)).toBe(true);
    expect(calls).toEqual(['malware.testcategory.com', 'example.com']); // third lookup came from the cache
  });

  it('skips IP literals and single-label names', async () => {
    clearSafeBrowsingCache();
    const calls: string[] = [];
    for (const host of ['192.0.2.1', '[2001:db8::1]', 'localhost']) expect(await isFlaggedHost(host, doh([], calls))).toBe(false);
    expect(calls).toEqual([]);
  });

  it('fails open when the lookup fails', async () => {
    clearSafeBrowsingCache();
    expect(await isFlaggedHost('a.example', async () => { throw new Error('offline'); })).toBe(false);
    expect(await isFlaggedHost('b.example', async () => new Response('nope', { status: 503 }))).toBe(false);
    expect(await isFlaggedHost('c.example', async () => Response.json({ Status: 2 }))).toBe(false);
  });

  it('finds the flagged host among several destinations', async () => {
    clearSafeBrowsingCache();
    expect(await findFlaggedHost(['ok.example', 'bad.example', 'OK.example'], doh(['bad.example']))).toBe('bad.example');
    expect(await findFlaggedHost(['ok.example'], doh(['bad.example']))).toBeNull();
  });
});

describe('update check', () => {
  it('compares semantic versions', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('v1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
    expect(compareVersions('garbage', '1.0.0')).toBe(0);
  });

  it('only reports an update when enabled and newer', () => {
    const newer = { version: '99.0.0', url: 'https://github.com/kitgenix/hoplane/releases/tag/v99.0.0', checked_at: 1 };
    expect(updateStatus(newer, true).update_available).toBe(true);
    expect(updateStatus(newer, false).update_available).toBe(false);
    expect(updateStatus({ ...newer, version: '0.0.1' }, true).update_available).toBe(false);
    expect(updateStatus(null, true)).toMatchObject({ latest: null, checked_at: null, update_available: false });
  });
});
