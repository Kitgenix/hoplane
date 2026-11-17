import { Hono } from 'hono';
import { z } from 'zod';
import { KITGENIX } from '../../shared/attribution';
import type { LinkStatus } from '../../shared/types';
import { requireScope } from '../auth';
import { VERSION, config, type AppEnv } from '../env';
import { badRequest, HttpError } from '../lib/errors';
import { isValidSlug, normaliseSlug, slugify } from '../lib/slug';
import { safeUrl } from '../lib/url';
import { toCsv } from '../services/analytics';
import {
  addTags, allTags, createLink, deleteLinks, getLinkRow, listLinks, parse, requireLink, setDisabled, statusOf, toLink, updateLink,
  type LinkRow,
} from '../services/links';
import { audit } from '../services/settings';

const routes = new Hono<AppEnv>();
const origin = (url: string) => new URL(url).origin;

/** Avoid invalid SQL LIMIT/OFFSET values from untrusted query parameters. */
function positiveIntQuery(value: string | undefined, fallback: number, max: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw badRequest(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) throw badRequest(`${name} must be between 1 and ${max}`);
  return parsed;
}

routes.get('/links', requireScope('links:read'), async (c) => {
  const q = c.req.query();
  const result = await listLinks(
    c.env.DB,
    {
      q: q.q,
      tag: q.tag,
      status: (q.status as LinkStatus | 'all') || 'all',
      sort: q.sort as never,
      page: positiveIntQuery(q.page, 1, 100_000, 'page'),
      limit: positiveIntQuery(q.limit, 25, 200, 'limit'),
    },
    origin(c.req.url),
  );
  return c.json({ ...result, items: result.items.map((l) => ({ ...l, status: statusOf(l) })) });
});

routes.post('/links', requireScope('links:write'), async (c) => {
  const link = await createLink(c.env, await c.req.json().catch(() => null), c.get('principal'), origin(c.req.url));
  return c.json(link, 201);
});

routes.get('/links/check', requireScope('links:read'), async (c) => {
  const cfg = config(c.env);
  const slug = normaliseSlug(c.req.query('slug') || '', cfg.caseSensitive);
  if (!isValidSlug(slug)) return c.json({ slug, available: false, reason: 'invalid' });
  const row = await c.env.DB.prepare('SELECT id FROM links WHERE slug = ?').bind(slug).first();
  return c.json({ slug, available: !row, reason: row ? 'taken' : null });
});

routes.get('/links/lookup', requireScope('links:read'), async (c) => {
  const row = await requireLink(c.env.DB, c.req.query('slug') || '');
  return c.json({ ...toLink(row, origin(c.req.url)), status: statusOf(toLink(row)) });
});

routes.get('/links/:id', requireScope('links:read'), async (c) => {
  const row = await requireLink(c.env.DB, c.req.param('id'));
  const link = toLink(row, origin(c.req.url));
  return c.json({ ...link, status: statusOf(link) });
});

routes.patch('/links/:id', requireScope('links:write'), async (c) => {
  const link = await updateLink(c.env, c.req.param('id'), await c.req.json().catch(() => null), c.get('principal'), origin(c.req.url));
  return c.json(link);
});

routes.delete('/links/:id', requireScope('links:write'), async (c) => {
  const n = await deleteLinks(c.env, [c.req.param('id')], c.get('principal'));
  if (!n) throw new HttpError(404, 'Link not found');
  return c.json({ ok: true });
});

routes.post('/links/bulk', requireScope('links:write'), async (c) => {
  const body = parse(
    z.object({
      action: z.enum(['delete', 'disable', 'enable', 'tag']),
      ids: z.array(z.string().max(200)).min(1).max(500),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    }),
    await c.req.json().catch(() => null),
  );
  const p = c.get('principal');
  let affected = 0;
  if (body.action === 'delete') affected = await deleteLinks(c.env, body.ids, p);
  else if (body.action === 'disable' || body.action === 'enable') affected = await setDisabled(c.env, body.ids, body.action === 'disable', p);
  else affected = await addTags(c.env, body.ids, body.tags ?? [], p);
  return c.json({ ok: true, affected });
});

routes.get('/tags', requireScope('links:read'), async (c) => c.json({ items: await allTags(c.env.DB) }));

/* ------------------------------------------------------------------ page metadata */

/**
 * Fetching a remote page is not equivalent to validating a redirect URL.
 * This conservative check requires an ordinary public DNS hostname.
 * It blocks IP literals, localhost/reserved names and nonstandard ports.
 * It does NOT replace provider-level egress controls or DNS/IP checks after resolution.
 */
export function isSafeMetadataTarget(value: string, selfHost?: string): boolean {
  const normalised = safeUrl(value);
  if (!normalised) return false;
  const u = new URL(normalised);
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const ownHost = selfHost?.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || (ownHost && host === ownHost)) return false;
  if (u.port && u.port !== '80' && u.port !== '443') return false;
  // URL normalises legacy IPv4 forms (127.1, decimal/hex IPs) to dotted IPs.
  // Disallow all IP literals, including public ones, for this metadata-only feature.
  if (/^\[.*\]$/.test(host) || /^\d+(?:\.\d+){3}$/.test(host)) return false;
  if (/(?:^|\.)(?:localhost|local|internal|lan|test|invalid|example|onion|arpa)$/.test(host)) return false;
  return true;
}

const META_TIMEOUT_MS = 6_000;
const META_MAX_BYTES = 256 * 1024;
const META_MAX_REDIRECTS = 3;

/** Read only the first part of HTML; never buffer an unbounded remote response. */
async function readMetadataHead(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remaining = META_MAX_BYTES;
  let html = '';
  try {
    while (remaining > 0) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, remaining);
      remaining -= chunk.byteLength;
      html += decoder.decode(chunk, { stream: true });
      if (/<\/head\s*>/i.test(html)) break;
      if (chunk.byteLength !== value.byteLength) break;
    }
    html += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  return html;
}

export async function fetchMeta(target: string, selfHost?: string) {
  const empty = { title: '', description: '', image: '', site_name: '' };
  if (!isSafeMetadataTarget(target, selfHost)) return empty;
  const signal = AbortSignal.timeout(META_TIMEOUT_MS); // One total timeout, including redirect hops.
  let current = target;

  for (let redirects = 0; redirects <= META_MAX_REDIRECTS; redirects++) {
    if (!isSafeMetadataTarget(current, selfHost)) return empty;
    const res = await fetch(current, {
      method: 'GET',
      headers: {
        'user-agent': `Mozilla/5.0 (compatible; Hoplane/${VERSION}; +${KITGENIX.repository})`,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual', // Every Location must be checked before the next fetch.
      signal,
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location || redirects >= META_MAX_REDIRECTS) return empty;
      let next: string;
      try { next = new URL(location, current).toString(); } catch { return empty; }
      if (!isSafeMetadataTarget(next, selfHost)) return empty;
      current = next;
      continue;
    }

    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(type)) {
      await res.body?.cancel();
      return empty;
    }

    const html = await readMetadataHead(res);
    if (!html) return empty;
    let title = '';
    const found: Record<string, string> = {};
    await new HTMLRewriter()
      .on('head > title', { text: (t) => { title = (title + t.text).slice(0, 2000); } })
      .on('meta', {
        element: (el) => {
          const key = (el.getAttribute('property') || el.getAttribute('name') || '').toLowerCase();
          const content = el.getAttribute('content');
          if (key && content && !found[key]) found[key] = content.trim().slice(0, 2048);
        },
      })
      .transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
      .arrayBuffer();

    const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    const meta = { ...empty };
    meta.title = decode(found['og:title'] || found['twitter:title'] || title).slice(0, 200);
    meta.description = decode(found['og:description'] || found['twitter:description'] || found['description'] || '').slice(0, 500);
    meta.site_name = decode(found['og:site_name'] || '').slice(0, 100);
    const img = found['og:image'] || found['twitter:image'];
    if (img) {
      try { meta.image = safeUrl(new URL(img, current).toString()) ?? ''; } catch { /* ignore */ }
    }
    return meta;
  }
  return empty;
}

routes.get('/meta', requireScope('links:write'), async (c) => {
  const target = safeUrl(c.req.query('url'));
  if (!target || !isSafeMetadataTarget(target, new URL(c.req.url).hostname))
    throw badRequest('Metadata can only be fetched from public website hostnames');
  let meta = { title: '', description: '', image: '', site_name: '' };
  try {
    meta = await fetchMeta(target, new URL(c.req.url).hostname);
  } catch {
    // Unreachable pages simply return empty metadata.
  }
  const fromPath = new URL(target).pathname.split('/').filter(Boolean).pop() || new URL(target).hostname.split('.')[0];
  return c.json({ ...meta, suggested_slug: slugify(meta.title || fromPath.replace(/\.\w+$/, '')) || null });
});

/* ------------------------------------------------------------------ import / export */

/** Accepts Kitgenix exports plus common fields from other shorteners (Bitly, Shlink, YOURLS CSVs). */
function normaliseImport(raw: Record<string, unknown>) {
  const pick = (...keys: string[]) => {
    for (const k of keys) if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return raw[k];
    return undefined;
  };
  const tags = pick('tags');
  const toMs = (v: unknown) => {
    if (v === undefined) return undefined;
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v; // seconds → ms
    if (typeof v === 'string' && /^\d+$/.test(v)) return toMs(Number(v));
    return v;
  };
  const out: Record<string, unknown> = {
    url: pick('url', 'long_url', 'longUrl', 'destination', 'target', 'original_url'),
    slug: pick('slug', 'keyword', 'short_code', 'shortCode', 'custom_bitlink', 'back_half'),
    title: pick('title', 'name'),
    description: pick('description'),
    image: pick('image'),
    notes: pick('notes', 'comment', 'note'),
    tags: Array.isArray(tags) ? tags.map(String) : typeof tags === 'string' ? tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean) : undefined,
    password: pick('password'), // Optional explicit replacement password, never exported by Hoplane.
    expires_at: toMs(pick('expires_at', 'expiration', 'expiresAt', 'validUntil')),
  };
  for (const k of ['redirect_code', 'forward_query', 'utm', 'rules', 'variants', 'warning', 'starts_at', 'expired_url', 'max_clicks', 'disabled'])
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') out[k] = raw[k];
  if (typeof out.slug === 'string') out.slug = out.slug.replace(/^https?:\/\/[^/]+\//, '');
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

routes.post('/import', requireScope('links:write'), async (c) => {
  const body = parse(
    z.object({ links: z.array(z.record(z.string(), z.unknown())).min(1).max(1000), on_conflict: z.enum(['skip', 'overwrite']).default('skip') }),
    await c.req.json().catch(() => null),
  );
  const p = c.get('principal');
  const o = origin(c.req.url);
  const cfg = config(c.env);
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as { row: number; slug?: string; error: string }[] };
  for (let i = 0; i < body.links.length; i++) {
    const item = normaliseImport(body.links[i]);
    try {
      const slug = typeof item.slug === 'string' ? normaliseSlug(item.slug, cfg.caseSensitive) : '';
      const existing = slug ? await getLinkRow(c.env.DB, slug) : null;
      // Exports contain only a has_password flag, never the password or hash.
      // Do not silently restore a protected link as a public link.
      if (body.links[i].has_password === true && !item.password && !existing?.password_hash) {
        throw badRequest('Protected links need a new password when imported; exported password hashes are not included');
      }
      if (existing) {
        if (body.on_conflict === 'skip') {
          result.skipped++;
          continue;
        }
        await updateLink(c.env, existing.id, item, p, o);
        result.updated++;
      } else {
        await createLink(c.env, item, p, o, { skipAudit: true });
        result.created++;
      }
    } catch (err) {
      result.errors.push({ row: i + 1, slug: typeof item.slug === 'string' ? item.slug : undefined, error: err instanceof Error ? err.message : 'Failed' });
    }
  }
  await audit(c.env.DB, p, 'link.import', `${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
  return c.json(result);
});

routes.get('/export', requireScope('links:read'), async (c) => {
  const format = c.req.query('format') === 'csv' ? 'csv' : 'json';
  const { results } = await c.env.DB.prepare('SELECT * FROM links ORDER BY created_at').all<LinkRow>();
  const o = origin(c.req.url);
  const links = results.map((r) => {
    const { short_url: _s, ...rest } = toLink(r, o);
    return rest;
  });
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    const cols = ['slug', 'url', 'title', 'description', 'tags', 'notes', 'has_password', 'clicks', 'disabled', 'expires_at', 'redirect_code', 'created_at'] as const;
    const csv = toCsv([...cols], links.map((l) => cols.map((k) => (k === 'tags' ? l.tags.join(',') : (k === 'expires_at' || k === 'created_at') && l[k] ? new Date(l[k] as number).toISOString() : l[k]))));
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="links-${stamp}.csv"`, 'Cache-Control': 'no-store' },
    });
  }
  return new Response(
    JSON.stringify({ format: 'hoplane', version: 1, generator: `${KITGENIX.product} ${VERSION}`, source: KITGENIX.repository, exported_at: new Date().toISOString(), count: links.length, links }, null, 2),
    { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="links-${stamp}.json"`, 'Cache-Control': 'no-store' } },
  );
});

export default routes;
