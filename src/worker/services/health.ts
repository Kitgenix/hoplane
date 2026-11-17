/**
 * Destination health checks.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 *
 * The daily maintenance run (when enabled in Settings → Security) requests each
 * link's destinations and records the worst result in `link_health`. Every
 * outbound request draws from a budget so a run stays within the Workers
 * subrequest limit; links not reached are checked on a later day.
 *
 * Checks use GET, like a visitor would. Some URLs perform an action on GET
 * (unsubscribe or one-time sign-in links), which is why checks are opt-in.
 */
import { KITGENIX } from '../../shared/attribution';
import type { HealthStatus, LinkHealth } from '../../shared/types';
import { VERSION, type Bindings } from '../env';
import { findFlaggedHost } from '../lib/safe-browsing';
import { isPublicFetchTarget } from '../lib/url';
import type { LinkRow } from './links';
import { getSettings } from './settings';

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const HOUR = 3_600_000;
/** A link is not rechecked by the daily run within this window. */
const RECHECK_AFTER_MS = 20 * HOUR;
/** Worst first wins when a link has several destinations. */
const SEVERITY: HealthStatus[] = ['ok', 'skipped', 'warning', 'unreachable', 'broken', 'flagged'];

export interface Budget {
  /** Outbound requests this run may still make. */
  remaining: number;
}

export type HealthResult = Omit<LinkHealth, 'checked_at'>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: Fetcher = (input, init) => fetch(input, init);

function classify(code: number, target: string): HealthResult {
  if (code < 400) return { status: 'ok', http_status: code, target, error: null };
  if (code === 404 || code === 410) return { status: 'broken', http_status: code, target, error: `The page returned HTTP ${code}` };
  if (code === 401 || code === 403 || code === 429)
    return { status: 'warning', http_status: code, target, error: `HTTP ${code}: the site may block automated checks` };
  return { status: 'warning', http_status: code, target, error: `The site returned HTTP ${code}` };
}

/**
 * Request one destination, following up to five redirects and re-checking that
 * every hop is a public hostname. Returns null if the budget ran out first.
 */
export async function checkDestination(target: string, budget: Budget, fetcher: Fetcher = defaultFetch): Promise<HealthResult | null> {
  if (!isPublicFetchTarget(target)) return { status: 'skipped', http_status: null, target, error: 'Only public website addresses can be checked' };
  const signal = AbortSignal.timeout(TIMEOUT_MS); // One total timeout across redirect hops.
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (budget.remaining <= 0) return null;
    budget.remaining--;
    let res: Response;
    try {
      res = await fetcher(current, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: { 'user-agent': `Mozilla/5.0 (compatible; ${KITGENIX.product}/${VERSION} link check; +${KITGENIX.repository})`, accept: '*/*' },
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      return { status: 'unreachable', http_status: null, target, error: timedOut ? 'No response within 10 seconds' : 'Could not connect to the site' };
    }
    await res.body?.cancel().catch(() => {});
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      let next: string | null = null;
      try {
        next = location ? new URL(location, current).toString() : null;
      } catch {}
      if (!next) return { status: 'warning', http_status: res.status, target, error: 'The site sent a redirect without a valid address' };
      if (!isPublicFetchTarget(next)) return { status: 'skipped', http_status: res.status, target, error: 'Redirects to an address that cannot be checked' };
      current = next;
      continue;
    }
    return classify(res.status, target);
  }
  return { status: 'warning', http_status: null, target, error: `More than ${MAX_REDIRECTS} redirects` };
}

function parseUrls(json: string | null | undefined): string[] {
  try {
    const items = JSON.parse(json || '[]') as { url?: unknown }[];
    return Array.isArray(items) ? items.map((i) => i?.url).filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

/** Every distinct destination of a link: main URL, rule and A/B targets, and the expiry fallback. */
export function destinationsOf(row: Pick<LinkRow, 'url' | 'rules' | 'variants' | 'expired_url'>): string[] {
  return [...new Set([row.url, ...parseUrls(row.rules), ...parseUrls(row.variants), row.expired_url].filter((u): u is string => !!u))];
}

/** Check all of a link's destinations; the worst result wins. Null if the budget ran out. */
export async function checkLink(
  row: Pick<LinkRow, 'url' | 'rules' | 'variants' | 'expired_url'>,
  budget: Budget,
  opts: { safeBrowsing: boolean; fetcher?: Fetcher },
): Promise<HealthResult | null> {
  const targets = destinationsOf(row);
  if (opts.safeBrowsing) {
    const hosts = [...new Set(targets.map((t) => new URL(t).hostname.toLowerCase()))];
    if (budget.remaining < hosts.length) return null;
    budget.remaining -= hosts.length; // Counted conservatively; cached verdicts make no request.
    const flagged = await findFlaggedHost(hosts, opts.fetcher);
    if (flagged) {
      const target = targets.find((t) => new URL(t).hostname.toLowerCase() === flagged) ?? null;
      return { status: 'flagged', http_status: null, target, error: "Cloudflare's security DNS lists this site as malware or phishing" };
    }
  }
  let worst: HealthResult | null = null;
  for (const target of targets) {
    const result = await checkDestination(target, budget, opts.fetcher);
    if (!result) return null;
    if (!worst || SEVERITY.indexOf(result.status) > SEVERITY.indexOf(worst.status)) worst = result;
  }
  return worst ?? { status: 'skipped', http_status: null, target: null, error: 'No destinations to check' };
}

/**
 * Store a result, but only if the link has not changed since it was read: a
 * check that raced with an edit must not attach an old verdict to new URLs.
 */
export async function saveHealth(db: D1Database, link: Pick<LinkRow, 'id' | 'updated_at'>, r: HealthResult, now = Date.now()): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO link_health (link_id, status, http_status, target, error, checked_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM links WHERE id = ?1 AND updated_at = ?7)
       ON CONFLICT(link_id) DO UPDATE SET status = excluded.status, http_status = excluded.http_status,
         target = excluded.target, error = excluded.error, checked_at = excluded.checked_at`,
    )
    .bind(link.id, r.status, r.http_status, r.target?.slice(0, 2048) ?? null, r.error?.slice(0, 300) ?? null, now, link.updated_at)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export function isProblem(status: HealthStatus): boolean {
  return status === 'warning' || status === 'unreachable' || status === 'broken' || status === 'flagged';
}

/** The daily run: least recently checked enabled links first, until the request budget is used. */
export async function runHealthChecks(env: Bindings, requests: number, now = Date.now()) {
  const report = { checked: 0, problems: 0 };
  const settings = await getSettings(env.DB, true);
  const budget: Budget = { remaining: requests };
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.updated_at, l.url, l.rules, l.variants, l.expired_url
     FROM links l LEFT JOIN link_health h ON h.link_id = l.id
     WHERE l.disabled = 0 AND (h.checked_at IS NULL OR h.checked_at < ?)
     ORDER BY h.checked_at IS NOT NULL, h.checked_at, l.created_at
     LIMIT ?`,
  )
    .bind(now - RECHECK_AFTER_MS, Math.min(1_000, requests))
    .all<Pick<LinkRow, 'id' | 'updated_at' | 'url' | 'rules' | 'variants' | 'expired_url'>>();
  for (const row of results) {
    const result = await checkLink(row, budget, { safeBrowsing: settings.safe_browsing });
    if (!result) break;
    if (await saveHealth(env.DB, row, result, now)) {
      report.checked++;
      if (isProblem(result.status)) report.problems++;
    }
  }
  return report;
}
