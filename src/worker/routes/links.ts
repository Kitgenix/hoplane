import { Hono } from 'hono';
import { z } from 'zod';
import { KITGENIX } from '../../shared/attribution';
import type { LinkStatus } from '../../shared/types';
import { requireScope } from '../auth';
import { VERSION, config, type AppEnv } from '../env';
import { badRequest, HttpError } from '../lib/errors';
import { isValidSlug, normaliseSlug, slugify } from '../lib/slug';
import { isPublicFetchTarget, safeUrl } from '../lib/url';
import { toCsv } from '../services/analytics';
import {
  addTags, allTags, countLinks, createLink, getLinksByIds, deleteLinks, getLinkRow, listLinks, parse, requireLink, setDisabled, statusOf, toLink, updateLink,
  type LinkRow,
} from '../services/links';
import { checkLink, saveHealth } from '../services/health';
import { normaliseImport } from '../services/importer';
import { emitLazily, linkEvent } from '../services/webhooks';
import { audit, getSettings } from '../services/settings';

const routes = new Hono<AppEnv>();
const origin = (url: string) => new URL(url).origin;
/** Request budget for one manual check: enough for a link with many rule and A/B destinations. */
const MANUAL_CHECK_REQUESTS = 60;

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
      health: q.health === 'problems' ? 'problems' : undefined,
    },
    origin(c.req.url),
  );
  return c.json({ ...result, items: result.items.map((l) => ({ ...l, status: statusOf(l) })) });
});

routes.post('/links', requireScope('links:write'), async (c) => {
  const link = await createLink(c.env, await c.req.json().catch(() => null), c.get('principal'), origin(c.req.url));
  c.executionCtx.waitUntil(emitLazily(c.env, 'link.created', () => [linkEvent.created(link)]));
  return c.json(link, 201);
});

routes.get('/links/check', requireScope('links:read'), async (c) => {
  const cfg = config(c.env);
  const slug = normaliseSlug(c.req.query('slug') || '', cfg.caseSensitive);
  if (!isValidSlug(slug)) return c.json({ slug, available: false, reason: 'invalid' });
  const row = await c.env.DB.prepare('SELECT id FROM links WHERE slug = ?').bind(slug).first();
  return c.json({ slug, available: !row, reason: row ? 'taken' : null });
});

// Registered before /links/:id so "count" is not read as a link id.
routes.get('/links/count', requireScope('links:read'), async (c) =>
  c.json(await countLinks(c.env.DB, { q: c.req.query('q') || undefined, tag: c.req.query('tag') || undefined })),
);

routes.get('/links/lookup', requireScope('links:read'), async (c) => {
  const row = await requireLink(c.env.DB, c.req.query('slug') || '');
  return c.json({ ...toLink(row, origin(c.req.url)), status: statusOf(toLink(row)) });
});

routes.get('/links/:id', requireScope('links:read'), async (c) => {
  const row = await requireLink(c.env.DB, c.req.param('id'));
  const link = toLink(row, origin(c.req.url));
  return c.json({ ...link, status: statusOf(link) });
});

/** Check this link's destinations now, whether or not daily checks are on. */
routes.post('/links/:id/health', requireScope('links:write'), async (c) => {
  const row = await requireLink(c.env.DB, c.req.param('id'));
  const settings = await getSettings(c.env.DB);
  const result = await checkLink(row, { remaining: MANUAL_CHECK_REQUESTS }, { safeBrowsing: settings.safe_browsing });
  if (!result) throw new HttpError(422, 'This link has too many destinations to check at once');
  await saveHealth(c.env.DB, row, result);
  const link = toLink((await getLinkRow(c.env.DB, row.id))!, origin(c.req.url));
  return c.json({ ...link, status: statusOf(link) });
});

routes.patch('/links/:id', requireScope('links:write'), async (c) => {
  const link = await updateLink(c.env, c.req.param('id'), await c.req.json().catch(() => null), c.get('principal'), origin(c.req.url));
  c.executionCtx.waitUntil(emitLazily(c.env, 'link.updated', () => [linkEvent.updated(link)]));
  return c.json(link);
});

routes.delete('/links/:id', requireScope('links:write'), async (c) => {
  const removed = await deleteLinks(c.env, [c.req.param('id')], c.get('principal'));
  if (!removed.length) throw new HttpError(404, 'Link not found');
  c.executionCtx.waitUntil(emitLazily(c.env, 'link.deleted', () => removed.map(linkEvent.deleted)));
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
  if (body.action === 'delete') {
    const removed = await deleteLinks(c.env, body.ids, p);
    affected = removed.length;
    c.executionCtx.waitUntil(emitLazily(c.env, 'link.deleted', () => removed.map(linkEvent.deleted)));
  } else {
    if (body.action === 'disable' || body.action === 'enable') affected = await setDisabled(c.env, body.ids, body.action === 'disable', p);
    else affected = await addTags(c.env, body.ids, body.tags ?? [], p);
    const o = origin(c.req.url);
    c.executionCtx.waitUntil(emitLazily(c.env, 'link.updated', async () => (await getLinksByIds(c.env.DB, body.ids, o)).map(linkEvent.updated)));
  }
  return c.json({ ok: true, affected });
});

routes.get('/tags', requireScope('links:read'), async (c) => c.json({ items: await allTags(c.env.DB) }));

/* ------------------------------------------------------------------ page metadata */

/** Kept for existing imports; the guard now lives in lib/url.ts. */
export const isSafeMetadataTarget = isPublicFetchTarget;

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

routes.post('/import', requireScope('links:write'), async (c) => {
  const body = parse(
    z.object({ links: z.array(z.record(z.string(), z.unknown())).min(1).max(1000), on_conflict: z.enum(['skip', 'overwrite']).default('skip') }),
    await c.req.json().catch(() => null),
  );
  const p = c.get('principal');
  const o = origin(c.req.url);
  const cfg = config(c.env);
  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as { row: number; slug?: string; error: string }[],
    warnings: [] as { row: number; slug?: string; warning: string }[],
  };
  for (let i = 0; i < body.links.length; i++) {
    const { input: item, passwordHash, passwordUnavailable, warnings } = normaliseImport(body.links[i]);
    try {
      const slug = typeof item.slug === 'string' ? normaliseSlug(item.slug, cfg.caseSensitive) : '';
      const existing = slug ? await getLinkRow(c.env.DB, slug) : null;
      // Never silently restore a protected link as a public link. Overwriting an
      // existing protected link without a new password keeps its current password.
      if (passwordUnavailable && !existing?.password_hash) throw badRequest(passwordUnavailable);
      let link;
      if (existing) {
        if (body.on_conflict === 'skip') {
          result.skipped++;
          continue;
        }
        link = await updateLink(c.env, existing.id, item, p, o, { passwordHash });
        result.updated++;
      } else {
        link = await createLink(c.env, item, p, o, { skipAudit: true, passwordHash });
        result.created++;
      }
      for (const warning of warnings) result.warnings.push({ row: i + 1, slug: link.slug, warning });
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
