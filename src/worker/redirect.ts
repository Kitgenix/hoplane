/**
 * The redirect engine: resolves /:slug to its destination.
 *
 * Order of evaluation:
 *   lookup (KV cache → D1) → availability (disabled / scheduled / expired / click limit)
 *   → password → link-preview crawlers → routing rules → A/B variants
 *   → UTM + query forwarding → record click (async) → optional warning page → redirect
 */
import type { RoutingRule, Utm, Variant } from '../shared/types';
import { config, type Bindings } from './env';
import { sha256, verifyPassword } from './lib/crypto';
import { baseHeaders, messagePage, passwordPage, previewPage, warningPage } from './lib/html';
import { rateLimit } from './lib/ratelimit';
import { isValidSlug, normaliseSlug } from './lib/slug';
import { buildDestination, safeUrl } from './lib/url';
import { isSocialCrawler, visitorFrom, type VisitorContext } from './lib/visitor';
import { recordClick } from './services/analytics';
import { cacheKey, statusOf, type LinkRow } from './services/links';
import { getSettings } from './services/settings';

const CACHE_TTL = 3600;
type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

async function loadLink(env: Bindings, slug: string, ctx: WaitUntil): Promise<LinkRow | null> {
  if (env.CACHE) {
    const hit = await env.CACHE.get<LinkRow>(cacheKey(slug), { type: 'json', cacheTtl: 60 }).catch(() => null);
    if (hit) {
      // Click limits need an exact, fresh count.
      if (hit.max_clicks) {
        const fresh = await env.DB.prepare('SELECT clicks, disabled FROM links WHERE id = ?').bind(hit.id).first<{ clicks: number; disabled: number }>();
        if (!fresh) return null;
        return { ...hit, ...fresh };
      }
      return hit;
    }
  }
  const row = await env.DB.prepare('SELECT * FROM links WHERE slug = ?').bind(slug).first<LinkRow>();
  if (row && env.CACHE) {
    const { notes: _n, ...cacheable } = row;
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
  const status = statusOf({
    disabled: !!link.disabled,
    expires_at: link.expires_at,
    starts_at: link.starts_at,
    max_clicks: link.max_clicks,
    clicks: link.clicks,
  });
  if (status === 'disabled') return messagePage(cfg.siteName, 410, 'Link unavailable', 'This link has been turned off by its owner.');
  if (status === 'scheduled') return messagePage(cfg.siteName, 404, 'Not live yet', 'This link is scheduled and is not active yet. Please check back later.');
  if (status === 'expired' || status === 'limit') {
    const fallback = safeUrl(link.expired_url);
    if (fallback) return new Response(null, { status: 302, headers: baseHeaders({ Location: fallback, 'Cache-Control': 'no-store' }) });
    return messagePage(cfg.siteName, 410, 'Link expired', 'This short link is no longer active.');
  }

  const visitor = visitorFrom(request);

  // Password protection
  if (link.password_hash) {
    if (request.method !== 'POST') return passwordPage(cfg.siteName, link.slug);
    const ipKey = (await sha256(visitor.ip || 'unknown')).slice(0, 16);
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

  // Choose the destination
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

  // Link-preview crawlers get Open Graph tags when the owner customised the preview.
  if (request.method === 'GET' && isSocialCrawler(visitor.ua) && (link.title || link.description || link.image)) {
    return previewPage(cfg.siteName, {
      title: link.title,
      description: link.description,
      image: link.image,
      url: destination,
      canonical: `${url.origin}/${link.slug}`,
    });
  }

  // Analytics never delay the redirect.
  if (request.method !== 'HEAD') {
    ctx.waitUntil(
      (async () => {
        const settings = await getSettings(env.DB);
        if (visitor.bot && !settings.track_bots) return;
        await recordClick(env.DB, link.id, visitor, { source: url.searchParams.has('qr') ? 'qr' : 'link', variant, destination });
      })().catch((err) => console.error('click recording failed', err)),
    );
  }

  const settings = await getSettings(env.DB);
  if (link.warning || settings.warn_all) return warningPage(cfg.siteName, destination);

  const code = request.method === 'POST' ? 303 : [301, 302, 307, 308].includes(link.redirect_code) ? link.redirect_code : 302;
  return new Response(null, {
    status: code,
    headers: baseHeaders({
      Location: destination,
      // Permanent redirects may be cached by browsers; temporary ones are never cached so every click is counted.
      'Cache-Control': code === 301 || code === 308 ? 'public, max-age=300' : 'private, no-store',
    }),
  });
}
