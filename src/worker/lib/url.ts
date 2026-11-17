import type { Utm } from '../../shared/types';

/**
 * Accepts only absolute HTTP(S) URLs without embedded credentials.
 * This validates redirect destinations, NOT whether an address is safe for
 * server-side fetches. Metadata fetches need separate SSRF protections.
 */
export function safeUrl(value: unknown, max = 4096): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** True when `hostname` equals or is a subdomain of any blocked domain. */
export function isBlockedHost(hostname: string, blocked: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, '');
  return blocked.some((b) => {
    const d = b.toLowerCase().trim().replace(/^\*\./, '').replace(/\.+$/, '');
    return !!d && (host === d || host.endsWith('.' + d));
  });
}

const RESERVED_QUERY = new Set(['qr']);

/**
 * Build the destination without overwriting the original destination query.
 * Configured UTM values take precedence over caller-supplied forwarded values.
 */
export function buildDestination(target: string, opts: { utm?: Utm; forwardFrom?: URLSearchParams | null }): string {
  const url = new URL(target);
  // Set administrator-configured campaign values BEFORE user-controlled query
  // forwarding, otherwise ?utm_campaign=... could override the link's settings.
  if (opts.utm) {
    for (const [k, v] of Object.entries(opts.utm)) {
      if (!v) continue;
      const key = `utm_${k}`;
      if (!url.searchParams.has(key)) url.searchParams.set(key, String(v));
    }
  }
  if (opts.forwardFrom) {
    for (const [k, v] of opts.forwardFrom) {
      if (RESERVED_QUERY.has(k.toLowerCase())) continue;
      if (!url.searchParams.has(k)) url.searchParams.append(k, v);
    }
  }
  return url.toString();
}

/**
 * Fetching a remote page is not equivalent to validating a redirect URL.
 * This conservative check requires an ordinary public DNS hostname.
 * It blocks IP literals, localhost/reserved names and nonstandard ports.
 * It does NOT replace provider-level egress controls or DNS/IP checks after resolution.
 */
export function isPublicFetchTarget(value: string, selfHost?: string): boolean {
  const normalised = safeUrl(value);
  if (!normalised) return false;
  const u = new URL(normalised);
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const ownHost = selfHost?.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || (ownHost && host === ownHost)) return false;
  if (u.port && u.port !== '80' && u.port !== '443') return false;
  // URL normalises legacy IPv4 forms (127.1, decimal/hex IPs) to dotted IPs.
  // Disallow all IP literals, including public ones, for server-side fetches.
  if (/^\[.*\]$/.test(host) || /^\d+(?:\.\d+){3}$/.test(host)) return false;
  if (/(?:^|\.)(?:localhost|local|internal|lan|test|invalid|example|onion|arpa)$/.test(host)) return false;
  return true;
}
