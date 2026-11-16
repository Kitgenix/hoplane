import type { Utm } from '../../shared/types';

/** Accepts only absolute http(s) URLs without embedded credentials. Returns the normalised URL or null. */
export function safeUrl(value: unknown, max = 4096): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** True when `hostname` equals or is a subdomain of any entry in `blocked`. */
export function isBlockedHost(hostname: string, blocked: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return blocked.some((b) => {
    const d = b.toLowerCase().trim().replace(/^\*\./, '').replace(/\.$/, '');
    return d && (host === d || host.endsWith('.' + d));
  });
}

const RESERVED_QUERY = new Set(['qr']);

/**
 * Build the final destination: append UTM parameters (without overriding ones
 * already in the destination) and optionally forward the short link's own query string.
 */
export function buildDestination(target: string, opts: { utm?: Utm; forwardFrom?: URLSearchParams | null }): string {
  const url = new URL(target);
  if (opts.forwardFrom) {
    for (const [k, v] of opts.forwardFrom) {
      if (RESERVED_QUERY.has(k)) continue;
      if (!url.searchParams.has(k)) url.searchParams.append(k, v);
    }
  }
  if (opts.utm) {
    for (const [k, v] of Object.entries(opts.utm)) {
      if (!v) continue;
      const key = `utm_${k}`;
      if (!url.searchParams.has(key)) url.searchParams.set(key, String(v));
    }
  }
  return url.toString();
}
