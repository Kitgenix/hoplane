/**
 * Hoplane redirect engine.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 *
 * Resolve a slug, enforce eligibility and password protection, select a
 * destination, then record analytics. Only links with a click limit wait for
 * an atomic D1 reservation; other links record the click in the background.
 */
import type { RoutingRule, Utm, Variant } from '../shared/types';
import { config, type Bindings } from './env';
import { sha256, verifyPassword } from './lib/crypto';
import { baseHeaders, messagePage, passwordPage, previewPage, warningPage } from './lib/html';
import { messages, negotiateLocale } from './lib/i18n';
import { rateLimit } from './lib/ratelimit';
import { isValidSlug, normaliseSlug } from './lib/slug';
import { buildDestination, safeUrl } from './lib/url';
import { isSocialCrawler, visitorFrom, type VisitorContext } from './lib/visitor';
import { dailySalt, recordClick } from './services/analytics';
import { cacheKey, statusOf, type LinkRow } from './services/links';
import { getSettings } from './services/settings';
import { emitLazily, makeEvent } from './services/webhooks';

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
  const url = new URL(request.url);
  const lang = negotiateLocale(request.headers.get('accept-language'));
  const t = messages(lang);
  const notice = (status: number, n: { title: string; message: string }, home = false) =>
    messagePage(cfg.siteName, status, n.title, n.message, home ? { href: '/', label: t.goHome } : undefined, lang);
  const notFound = () => {
    // Uncached 302 so creating the link later takes effect at once. Skip the
    // redirect if it points back at this same path, which would loop.
    if (cfg.notFoundUrl) {
      const target = new URL(cfg.notFoundUrl);
      if (target.origin !== url.origin || target.pathname !== url.pathname) {
        return new Response(null, { status: 302, headers: baseHeaders({ Location: cfg.notFoundUrl, 'Cache-Control': 'no-store' }) });
      }
    }
    return notice(404, t.notFound, true);
  };
  if (!isValidSlug(slug)) return notFound();

  const link = await loadLink(env, slug, ctx);
  if (!link) return notFound();

  const unavailable = (row: LinkRow): Response | null => {
    const status = statusOf({
      disabled: !!row.disabled,
      expires_at: row.expires_at,
      starts_at: row.starts_at,
      max_clicks: row.max_clicks,
      clicks: row.clicks,
    });
    if (status === 'disabled') return notice(410, t.disabled);
    if (status === 'scheduled') return notice(404, t.scheduled);
    if (status === 'expired' || status === 'limit') {
      const fallback = safeUrl(row.expired_url);
      if (fallback) return new Response(null, { status: 302, headers: baseHeaders({ Location: fallback, 'Cache-Control': 'no-store' }) });
      return notice(410, t.expired);
    }
    return null;
  };
  const initialUnavailable = unavailable(link);
  if (initialUnavailable) return initialUnavailable;

  const visitor = visitorFrom(request);

  // Password protection: password POSTs are later redirected with HTTP 303,
  // never with 307/308 (which could forward the submitted password).
  // API and command-line clients can send the password in an X-Link-Password
  // header instead of the form; they get plain-text errors rather than HTML.
  if (link.password_hash) {
    const headerPassword = request.headers.get('x-link-password');
    const plain = (status: number, message: string) => new Response(message, { status, headers: baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }) });
    if (headerPassword === null && request.method !== 'POST') return passwordPage(cfg.siteName, link.slug, undefined, 200, lang);
    // Salt the rate-limit key so a stored hash of a low-entropy IPv4 address
    // cannot be enumerated offline. Use the existing per-day random salt.
    // Header and form attempts share one limit.
    const salt = await dailySalt(env.DB);
    const ipKey = (await sha256(`${salt}|password:${link.id}|${visitor.ip || 'unknown'}`)).slice(0, 32);
    if (!(await rateLimit(env.DB, `pw:${link.id}:${ipKey}`, 10, 10 * 60_000))) {
      return headerPassword !== null
        ? plain(429, 'Too many attempts. Please wait a few minutes and try again.')
        : passwordPage(cfg.siteName, link.slug, t.password.tooMany, 429, lang);
    }
    const pw = headerPassword ?? (await request.formData().catch(() => null))?.get('password');
    if (typeof pw !== 'string' || !(await verifyPassword(pw, link.password_hash))) {
      return headerPassword !== null ? plain(401, 'Incorrect password') : passwordPage(cfg.siteName, link.slug, t.password.wrong, 401, lang);
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
  if (!safeTarget) return notice(422, t.invalidDestination);
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
    }, lang);
  }

  const settings = await getSettings(env.DB);
  const shouldRecordAnalytics = request.method !== 'HEAD' && (!visitor.bot || settings.track_bots);
  const click = { source: url.searchParams.has('qr') ? ('qr' as const) : ('link' as const), variant, destination };
  // User-Agent is caller-controlled. Excluding bots from analytics MUST NOT let
  // an attacker bypass max_clicks by sending a bot User-Agent. For capped links,
  // every successful non-HEAD request reserves an accepted redirect, including
  // requests classified as bots. Excluded bots are not written to click analytics.
  const capped = link.max_clicks !== null;

  if (!capped) {
    // Nothing is enforced by the counter of an uncapped link, so the redirect does
    // not wait for a write to the D1 primary (a cross-region round trip for distant
    // visitors). The click row and the counter are written together in the
    // background. Eligibility was checked against fresh D1 state in loadLink.
    if (shouldRecordAnalytics) {
      ctx.waitUntil(recordClick(env.DB, link.id, visitor, click).catch((err) => console.error('click recording failed', err)));
    }
  } else if (request.method !== 'HEAD') {
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
      return notice(409, t.linkChanged);
    }

    // Analytics are best-effort asynchronous; the accepted request was already
    // counted in D1. Keep excluded bots out of detailed analytics even though
    // their redirects consume a capped link's allowance.
    if (shouldRecordAnalytics) {
      ctx.waitUntil(recordClick(env.DB, link.id, visitor, click, { counterReserved: true }).catch((err) => console.error('click recording failed', err)));
    }
  }

  if (shouldRecordAnalytics) {
    // Only coarse, non-identifying attributes: no IP, user agent, coordinates or visitor hash.
    ctx.waitUntil(
      emitLazily(env, 'link.clicked', () => [
        makeEvent('link.clicked', {
          link: { id: link.id, slug: link.slug },
          click: {
            source: click.source,
            variant,
            country: visitor.country,
            region: visitor.region,
            city: visitor.city,
            continent: visitor.continent,
            device: visitor.device,
            os: visitor.os,
            browser: visitor.browser,
            language: visitor.language,
            referrer: visitor.referrer,
          },
        }),
      ]),
    );
  }

  if (link.warning || settings.warn_all) return warningPage(cfg.siteName, destination, lang);

  const code = request.method === 'POST' ? 303 : [301, 302, 307, 308].includes(link.redirect_code) ? link.redirect_code : 302;
  return new Response(null, {
    status: code,
    headers: baseHeaders({
      Location: destination,
      // Permanent redirects may be browser-cached and cannot be revoked
      // immediately by changing a link. Temporary redirects are uncached.
      // A protected link's destination must never land in a shared cache,
      // where a request without the password could be served it.
      'Cache-Control': (code === 301 || code === 308) && !link.password_hash ? 'public, max-age=300' : 'private, no-store',
    }),
  });
}
