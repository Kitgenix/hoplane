/**
 * Hoplane redirect engine.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 *
 * Resolve a slug, enforce eligibility and password protection, select a
 * destination, reserve a permitted click atomically, then record analytics.
 */
import type { RoutingRule, Utm, Variant } from '../shared/types';
import { config, type Bindings } from './env';
import { sha256, verifyPassword } from './lib/crypto';
import { baseHeaders, messagePage, passwordPage, previewPage, warningPage } from './lib/html';
import { rateLimit } from './lib/ratelimit';
import { isValidSlug, normaliseSlug } from './lib/slug';
import { buildDestination, safeUrl } from './lib/url';
import { isSocialCrawler, visitorFrom, type VisitorContext } from './lib/visitor';
import { dailySalt, recordClick } from './services/analytics';
import { cacheKey, statusOf, type LinkRow } from './services/links';
import { getSettings } from './services/settings';

const CACHE_TTL = 3600;
type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

/** Values that must come from D1 on every request, not an eventually-consistent KV value. */
type FreshLinkState = Pick<
  LinkRow,
  'id' | 'slug' | 'updated_at' | 'disabled' | 'starts_at' | 'expires_at' | 'max_clicks' | 'clicks' | 'last_clicked_at'
>;

async function loadLink(env: Bindings, slug: string, ctx: WaitUntil): Promise<LinkRow | null> {
  if (env.CACHE) {
    const hit = await env.CACHE.get<LinkRow>(cacheKey(slug), { type: 'json', cacheTtl: 60 }).catch(() => null);
    if (hit) {
      // A KV deletion or overwrite can remain stale in other regions. A fresh D1
      // check is mandatory before using ANY cached destination/password/disabled
      // information. Cache is only trusted when the DB version matches.
      const state = await env.DB.prepare(
        `SELECT id, slug, updated_at, disabled, starts_at, expires_at, max_clicks, clicks, last_clicked_at
         FROM links WHERE slug = ?`,
      ).bind(slug).first<FreshLinkState>();
      if (!state) return null;
      if (hit.id === state.id && hit.updated_at === state.updated_at) {
        return { ...hit, ...state };
      }
    }
  }
  const row = await env.DB.prepare('SELECT * FROM links WHERE slug = ?').bind(slug).first<LinkRow>();
  if (row && env.CACHE) {
    // Never put private notes in the global edge cache.
    const { notes: _notes, ...cacheable } = row;
    ctx.waitUntil(env.CACHE.put(cacheKey(slug), JSON.stringify({ ...cacheable, notes: '' }), { expirationTtl: CACHE_TTL }).catch(() => {}));
  }
  return row;
}

function parse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function matchRule(rule: RoutingRule, v: VisitorContext): boolean {
  const actual = (
    {
      country: v.country,
      continent: v.continent,
      device: v.device,
      os: v.os,
      browser: v.browser,
      language: v.language,
      referrer: v.referrer,
    } as Record<string, string | null>
  )[rule.field]?.toLowerCase();
  const values = rule.values.map((x) => x.trim().toLowerCase());
  const hit = !!actual && values.some((x) => (rule.field === 'referrer' ? actual === x || actual.endsWith('.' + x) : actual === x));
  return rule.op === 'not_in' ? !hit : hit;
}

export function pickVariant(variants: Variant[], rand = Math.random()): number | null {
  const total = variants.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (!variants.length || total <= 0) return null;
  let r = rand * total;
  for (let i = 0; i < variants.length; i++) {
    r -= Math.max(0, variants[i].weight);
    if (r < 0) return i;
  }
  return variants.length - 1;
}

export async function handleRedirect(request: Request, env: Bindings, ctx: WaitUntil, rawSlug: string): Promise<Response> {
  const cfg = config(env);
  let decoded = rawSlug;
  try {
    decoded = decodeURIComponent(rawSlug);
  } catch {}
  const slug = normaliseSlug(decoded, cfg.caseSensitive);
  const notFound = () => messagePage(cfg.siteName, 404, 'Link not found', 'This short link does not exist. Check the address and try again.', { href: '/', label: 'Go to homepage' });
  if (!isValidSlug(slug)) return notFound();

  const link = await loadLink(env, slug, ctx);
  if (!link) return notFound();

  const url = new URL(request.url);
  const unavailable = (row: LinkRow): Response | null => {
    const status = statusOf({
      disabled: !!row.disabled,
      expires_at: row.expires_at,
      starts_at: row.starts_at,
      max_clicks: row.max_clicks,
      clicks: row.clicks,
    });
    if (status === 'disabled') return messagePage(cfg.siteName, 410, 'Link unavailable', 'This link has been turned off by its owner.');
    if (status === 'scheduled') return messagePage(cfg.siteName, 404, 'Not live yet', 'This link is scheduled and is not active yet. Please check back later.');
    if (status === 'expired' || status === 'limit') {
      const fallback = safeUrl(row.expired_url);
      if (fallback) return new Response(null, { status: 302, headers: baseHeaders({ Location: fallback, 'Cache-Control': 'no-store' }) });
      return messagePage(cfg.siteName, 410, 'Link expired', 'This short link is no longer active.');
    }
    return null;
  };
  const initialUnavailable = unavailable(link);
  if (initialUnavailable) return initialUnavailable;

  const visitor = visitorFrom(request);

  // Password protection: password POSTs are later redirected with HTTP 303,
  // never with 307/308 (which could forward the submitted password).
  if (link.password_hash) {
    if (request.method !== 'POST') return passwordPage(cfg.siteName, link.slug);
    // Salt the rate-limit key so a stored hash of a low-entropy IPv4 address
    // cannot be enumerated offline. Use the existing per-day random salt.
    const salt = await dailySalt(env.DB);
    const ipKey = (await sha256(`${salt}|password:${link.id}|${visitor.ip || 'unknown'}`)).slice(0, 32);
    if (!(await rateLimit(env.DB, `pw:${link.id}:${ipKey}`, 10, 10 * 60_000))) {
      return passwordPage(cfg.siteName, link.slug, 'Too many attempts. Please wait a few minutes and try again.', 429);
    }
    const form = await request.formData().catch(() => null);
    const pw = form?.get('password');
    if (typeof pw !== 'string' || !(await verifyPassword(pw, link.password_hash))) {
      return passwordPage(cfg.siteName, link.slug, 'That password is not correct.', 401);
    }
  } else if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: baseHeaders({ Allow: 'GET, HEAD' }) });
  }

  const rules = parse<RoutingRule[]>(link.rules, []);
  const variants = parse<Variant[]>(link.variants, []);
  let target = link.url;
  let variant: number | null = null;
  const rule = rules.find((r) => matchRule(r, visitor));
  if (rule) target = rule.url;
  else if (variants.length) {
    variant = pickVariant(variants);
    if (variant !== null) target = variants[variant].url;
  }
  const safeTarget = safeUrl(target);
  if (!safeTarget) return messagePage(cfg.siteName, 422, 'Invalid destination', 'This link points to an address that cannot be opened.');
  const destination = buildDestination(safeTarget, {
    utm: parse<Utm>(link.utm, {}),
    forwardFrom: link.forward_query ? url.searchParams : null,
  });

  // A social crawler requesting a customised preview does not follow the link.
  if (request.method === 'GET' && isSocialCrawler(visitor.ua) && (link.title || link.description || link.image)) {
    return previewPage(cfg.siteName, {
      title: link.title,
      description: link.description,
      image: link.image,
      url: destination,
      canonical: `${url.origin}/${link.slug}`,
    });
  }

  const settings = await getSettings(env.DB);
  const shouldRecordAnalytics = request.method !== 'HEAD' && (!visitor.bot || settings.track_bots);
  // User-Agent is caller-controlled. Excluding bots from analytics MUST NOT let
  // an attacker bypass max_clicks by sending a bot User-Agent. For capped links,
  // every successful non-HEAD request reserves an accepted redirect, including
  // requests classified as bots. Excluded bots are not written to click analytics.
  const shouldReserve = request.method !== 'HEAD' && (shouldRecordAnalytics || link.max_clicks !== null);

  if (shouldReserve) {
    // A single conditional D1 UPDATE both reserves the click and enforces
    // the limit atomically across Worker isolates. updated_at also detects
    // concurrent changes to the link's security settings or destination.
    const now = Date.now();
    const reserved = await env.DB.prepare(
      `UPDATE links
       SET clicks = clicks + 1, last_clicked_at = ?
       WHERE id = ? AND slug = ? AND updated_at = ? AND disabled = 0
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (expires_at IS NULL OR expires_at > ?)
         AND (max_clicks IS NULL OR clicks < max_clicks)
       RETURNING id`,
    ).bind(now, link.id, link.slug, link.updated_at, now, now).first<{ id: string }>();

    if (!reserved) {
      // The link was edited, removed, disabled, expired, or reached its limit
      // between lookup and reservation. Never redirect using old cached data.
      const latest = await env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(link.id).first<LinkRow>();
      if (!latest || latest.slug !== slug) return notFound();
      const blocked = unavailable(latest);
      if (blocked) return blocked;
      return messagePage(cfg.siteName, 409, 'Link changed', 'This short link was updated. Please try again.');
    }

    // Analytics are best-effort asynchronous; the accepted request was already
    // counted in D1. Keep excluded bots out of detailed analytics even though
    // their redirects consume a capped link's allowance.
    if (shouldRecordAnalytics) {
      ctx.waitUntil(recordClick(env.DB, link.id, visitor, {
        source: url.searchParams.has('qr') ? 'qr' : 'link',
        variant,
        destination,
      }, { counterReserved: true }).catch((err) => console.error('click recording failed', err)));
    }
  }

  if (link.warning || settings.warn_all) return warningPage(cfg.siteName, destination);

  const code = request.method === 'POST' ? 303 : [301, 302, 307, 308].includes(link.redirect_code) ? link.redirect_code : 302;
  return new Response(null, {
    status: code,
    headers: baseHeaders({
      Location: destination,
      // Permanent redirects may be browser-cached and cannot be revoked
      // immediately by changing a link. Temporary redirects are uncached.
      'Cache-Control': code === 301 || code === 308 ? 'public, max-age=300' : 'private, no-store',
    }),
  });
}
