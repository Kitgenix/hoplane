/**
 * Destination malware/phishing check using Cloudflare's security resolver
 * (1.1.1.2, "1.1.1.1 for Families — malware blocking"). Names it blocks resolve
 * to 0.0.0.0, so one DNS-over-HTTPS lookup per host is enough.
 *
 * Fails open: a timeout, network error or unexpected answer allows the link.
 * The check is a safety net, not a guarantee.
 */
export const SECURITY_DOH = 'https://security.cloudflare-dns.com/dns-query';
const TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 60 * 60_000;
const CACHE_MAX = 1_000;

/** Per-isolate verdict cache; keeps bulk imports from repeating lookups. */
const cache = new Map<string, { flagged: boolean; at: number }>();

export function clearSafeBrowsingCache() {
  cache.clear();
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function lookupable(host: string): boolean {
  // IP literals and single-label names have nothing to resolve.
  return host.includes('.') && !host.includes(':') && !host.startsWith('[') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export async function isFlaggedHost(rawHost: string, fetcher: Fetcher = (input, init) => fetch(input, init)): Promise<boolean> {
  const host = rawHost.toLowerCase().replace(/\.$/, '');
  if (!lookupable(host)) return false;
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.flagged;
  try {
    const res = await fetcher(`${SECURITY_DOH}?name=${encodeURIComponent(host)}&type=A`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { Status?: number; Answer?: { type?: number; data?: string }[] };
    const flagged = body.Status === 0 && !!body.Answer?.some((a) => a.type === 1 && a.data === '0.0.0.0');
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(host, { flagged, at: Date.now() });
    return flagged;
  } catch {
    return false;
  }
}

/** The first host in `hosts` that the resolver blocks, or null. Lookups run in parallel. */
export async function findFlaggedHost(hosts: string[], fetcher?: Fetcher): Promise<string | null> {
  const unique = [...new Set(hosts.map((h) => h.toLowerCase()))];
  const verdicts = await Promise.all(unique.map((h) => isFlaggedHost(h, fetcher)));
  return unique.find((_, i) => verdicts[i]) ?? null;
}
