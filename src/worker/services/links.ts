import { z } from 'zod';
import type { Link, LinkStatus, RoutingRule, Utm, Variant } from '../../shared/types';
import { RULE_FIELDS } from '../../shared/types';
import { config, type Bindings, type Principal } from '../env';
import { hashPassword, uuid } from '../lib/crypto';
import { badRequest, conflict, notFound } from '../lib/errors';
import { isValidSlug, normaliseSlug, randomSlug } from '../lib/slug';
import { isBlockedHost, safeUrl } from '../lib/url';
import { audit, getSettings } from './settings';

/* ------------------------------------------------------------------ schema */

const httpUrl = z.string().transform((v, ctx) => {
  const u = safeUrl(v);
  if (!u) {
    ctx.addIssue({ code: 'custom', message: 'Must be a valid http:// or https:// URL' });
    return z.NEVER;
  }
  return u;
});
const optionalUrl = z.union([z.literal('').transform(() => null), httpUrl]).nullable();
const timestamp = z.preprocess((v) => {
  if (v === '' || v === undefined) return v === '' ? null : undefined;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : v;
  }
  return v;
}, z.number().int().positive().nullable().optional());

const text = (max: number) => z.string().trim().max(max);

export const linkInput = z.object({
  url: httpUrl,
  slug: z.string().max(128).optional(),
  title: text(200).optional(),
  description: text(500).optional(),
  image: optionalUrl.optional(),
  notes: text(2000).optional(),
  tags: z.array(text(40).min(1)).max(20).optional(),
  redirect_code: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).optional(),
  forward_query: z.boolean().optional(),
  utm: z
    .object({ source: text(100), medium: text(100), campaign: text(100), term: text(100), content: text(100) })
    .partial()
    .optional(),
  rules: z
    .array(
      z.object({
        field: z.enum(RULE_FIELDS as [string, ...string[]]),
        op: z.enum(['in', 'not_in']).default('in'),
        values: z.array(text(60).min(1)).min(1).max(100),
        url: httpUrl,
      }),
    )
    .max(25)
    .optional(),
  variants: z.array(z.object({ url: httpUrl, weight: z.number().int().min(0).max(1000) })).max(10).optional(),
  /** A string sets the password, null or "" removes it, omitted leaves it unchanged. */
  password: z.string().max(200).nullable().optional(),
  warning: z.boolean().optional(),
  starts_at: timestamp,
  expires_at: timestamp,
  expired_url: optionalUrl.optional(),
  max_clicks: z.number().int().positive().max(1_000_000_000).nullable().optional(),
  disabled: z.boolean().optional(),
});
export const linkPatch = linkInput.partial();
export type LinkInput = z.input<typeof linkInput>;

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    throw badRequest(`${path}${issue?.message ?? 'Invalid input'}`, r.error.issues);
  }
  return r.data;
}

/* ------------------------------------------------------------------ rows */

export interface LinkRow {
  id: string;
  slug: string;
  url: string;
  title: string;
  description: string;
  image: string;
  notes: string;
  tags: string;
  redirect_code: number;
  forward_query: number;
  utm: string;
  rules: string;
  variants: string;
  password_hash: string | null;
  warning: number;
  starts_at: number | null;
  expires_at: number | null;
  expired_url: string | null;
  max_clicks: number | null;
  disabled: number;
  clicks: number;
  last_clicked_at: number | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

const json = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export function toLink(row: LinkRow, origin?: string): Link {
  return {
    id: row.id,
    slug: row.slug,
    url: row.url,
    title: row.title,
    description: row.description,
    image: row.image,
    notes: row.notes,
    tags: json<string[]>(row.tags, []),
    redirect_code: row.redirect_code as Link['redirect_code'],
    forward_query: !!row.forward_query,
    utm: json<Utm>(row.utm, {}),
    rules: json<RoutingRule[]>(row.rules, []),
    variants: json<Variant[]>(row.variants, []),
    has_password: !!row.password_hash,
    warning: !!row.warning,
    starts_at: row.starts_at,
    expires_at: row.expires_at,
    expired_url: row.expired_url,
    max_clicks: row.max_clicks,
    disabled: !!row.disabled,
    clicks: row.clicks,
    last_clicked_at: row.last_clicked_at,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(origin ? { short_url: `${origin}/${row.slug}` } : {}),
  };
}

export function statusOf(l: Pick<Link, 'disabled' | 'expires_at' | 'starts_at' | 'max_clicks' | 'clicks'>, now = Date.now()): LinkStatus {
  if (l.disabled) return 'disabled';
  if (l.expires_at && l.expires_at <= now) return 'expired';
  if (l.max_clicks && l.clicks >= l.max_clicks) return 'limit';
  if (l.starts_at && l.starts_at > now) return 'scheduled';
  return 'active';
}

/* ------------------------------------------------------------------ cache */

export const cacheKey = (slug: string) => `link:${slug}`;

export async function purgeCache(env: Bindings, ...slugs: string[]) {
  if (!env.CACHE) return;
  await Promise.all(slugs.map((s) => env.CACHE!.delete(cacheKey(s)).catch(() => {})));
}

/* ------------------------------------------------------------------ queries */

export interface ListQuery {
  q?: string;
  tag?: string;
  status?: LinkStatus | 'all';
  sort?: 'created_desc' | 'created_asc' | 'clicks_desc' | 'slug_asc' | 'recent_click';
  page?: number;
  limit?: number;
}

const SORTS: Record<NonNullable<ListQuery['sort']>, string> = {
  created_desc: 'created_at DESC',
  created_asc: 'created_at ASC',
  clicks_desc: 'clicks DESC, created_at DESC',
  slug_asc: 'slug ASC',
  recent_click: 'last_clicked_at IS NULL, last_clicked_at DESC',
};

export async function listLinks(db: D1Database, q: ListQuery, origin?: string) {
  const where: string[] = [];
  const args: unknown[] = [];
  const now = Date.now();
  if (q.q?.trim()) {
    const like = `%${q.q.trim().slice(0, 100).replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    where.push("(slug LIKE ?1 ESCAPE '\\' OR url LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\' OR notes LIKE ?1 ESCAPE '\\')".replace(/\?1/g, `?${args.length + 1}`));
    args.push(like);
  }
  if (q.tag) {
    where.push(`EXISTS (SELECT 1 FROM json_each(links.tags) WHERE json_each.value = ?${args.length + 1})`);
    args.push(q.tag);
  }
  const n = (v: unknown) => {
    args.push(v);
    return `?${args.length}`;
  };
  switch (q.status) {
    case 'disabled':
      where.push('disabled = 1');
      break;
    case 'expired':
      where.push(`disabled = 0 AND expires_at IS NOT NULL AND expires_at <= ${n(now)}`);
      break;
    case 'limit':
      where.push('disabled = 0 AND max_clicks IS NOT NULL AND clicks >= max_clicks');
      break;
    case 'scheduled':
      where.push(`disabled = 0 AND starts_at IS NOT NULL AND starts_at > ${n(now)}`);
      break;
    case 'active': {
      const p = n(now);
      where.push(`disabled = 0 AND (expires_at IS NULL OR expires_at > ${p}) AND (starts_at IS NULL OR starts_at <= ${p}) AND (max_clicks IS NULL OR clicks < max_clicks)`);
      break;
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(200, Math.max(1, q.limit ?? 25));
  const page = Math.max(1, q.page ?? 1);
  const order = SORTS[q.sort ?? 'created_desc'] ?? SORTS.created_desc;
  const [rows, count] = await db.batch([
    db.prepare(`SELECT * FROM links ${whereSql} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`).bind(...args),
    db.prepare(`SELECT COUNT(*) AS total FROM links ${whereSql}`).bind(...args),
  ]);
  return {
    items: (rows.results as LinkRow[]).map((r) => toLink(r, origin)),
    total: (count.results[0] as { total: number }).total,
    page,
    limit,
  };
}

export async function getLinkRow(db: D1Database, idOrSlug: string): Promise<LinkRow | null> {
  return db.prepare('SELECT * FROM links WHERE id = ?1 OR slug = ?1 LIMIT 1').bind(idOrSlug).first<LinkRow>();
}

export async function requireLink(db: D1Database, idOrSlug: string): Promise<LinkRow> {
  const row = await getLinkRow(db, idOrSlug);
  if (!row) throw notFound('Link not found');
  return row;
}

export async function allTags(db: D1Database) {
  const { results } = await db
    .prepare('SELECT json_each.value AS tag, COUNT(*) AS count FROM links, json_each(links.tags) GROUP BY tag ORDER BY count DESC, tag ASC LIMIT 200')
    .all<{ tag: string; count: number }>();
  return results;
}

/* ------------------------------------------------------------------ mutations */

async function checkDestinations(env: Bindings, urls: (string | null | undefined)[], selfHost?: string) {
  const { blocked_domains } = await getSettings(env.DB);
  for (const u of urls) {
    if (!u) continue;
    const host = new URL(u).hostname;
    if (selfHost && host === selfHost) throw badRequest('A short link cannot point back to this shortener');
    if (isBlockedHost(host, blocked_domains)) throw badRequest(`Links to ${host} are blocked on this instance`);
  }
}

function destinations(v: Partial<z.output<typeof linkInput>>) {
  return [v.url, v.expired_url, ...(v.rules ?? []).map((r) => r.url), ...(v.variants ?? []).map((x) => x.url)];
}

function validateWindow(starts: number | null | undefined, expires: number | null | undefined) {
  if (starts && expires && expires <= starts) throw badRequest('Expiry must be after the start time');
}

export async function createLink(env: Bindings, raw: unknown, p: Principal | null, origin?: string, opts: { skipAudit?: boolean } = {}): Promise<Link> {
  const input = parse(linkInput, raw);
  const cfg = config(env);
  const selfHost = origin ? new URL(origin).hostname : undefined;
  await checkDestinations(env, destinations(input), selfHost);
  validateWindow(input.starts_at, input.expires_at);

  let slug = input.slug ? normaliseSlug(input.slug, cfg.caseSensitive) : '';
  if (slug && !isValidSlug(slug)) throw badRequest('Slug may use letters, numbers, "-", "_" and "/" separators, up to 128 characters, and must not be a reserved word');
  const custom = !!slug;
  const now = Date.now();
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  for (let attempt = 0; attempt < 6; attempt++) {
    if (!custom) slug = randomSlug(cfg.slugLength + (attempt >= 3 ? 1 : 0));
    const id = uuid();
    try {
      await env.DB.prepare(
        `INSERT INTO links (id, slug, url, title, description, image, notes, tags, redirect_code, forward_query, utm, rules, variants,
          password_hash, warning, starts_at, expires_at, expired_url, max_clicks, disabled, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          id, slug, input.url, input.title ?? '', input.description ?? '', input.image ?? '', input.notes ?? '',
          JSON.stringify(dedupe(input.tags ?? [])), input.redirect_code ?? 302, input.forward_query === false ? 0 : 1,
          JSON.stringify(clean(input.utm ?? {})), JSON.stringify(input.rules ?? []), JSON.stringify(input.variants ?? []),
          passwordHash, input.warning ? 1 : 0, input.starts_at ?? null, input.expires_at ?? null, input.expired_url ?? null,
          input.max_clicks ?? null, input.disabled ? 1 : 0, p?.userId ?? null, now, now,
        )
        .run();
      if (!opts.skipAudit) await audit(env.DB, p, 'link.create', slug, input.url);
      return toLink((await getLinkRow(env.DB, id))!, origin);
    } catch (err) {
      if (!String(err).includes('UNIQUE')) throw err;
      if (custom) throw conflict(`The slug "${slug}" is already taken`);
    }
  }
  throw new Error('Could not allocate a unique slug');
}

export async function updateLink(env: Bindings, idOrSlug: string, raw: unknown, p: Principal | null, origin?: string): Promise<Link> {
  const current = await requireLink(env.DB, idOrSlug);
  const input = parse(linkPatch, raw);
  const cfg = config(env);
  await checkDestinations(env, destinations(input), origin ? new URL(origin).hostname : undefined);
  validateWindow(
    input.starts_at !== undefined ? input.starts_at : current.starts_at,
    input.expires_at !== undefined ? input.expires_at : current.expires_at,
  );

  const sets: string[] = [];
  const args: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    args.push(v);
  };
  let newSlug: string | null = null;
  if (input.slug !== undefined) {
    const slug = normaliseSlug(input.slug, cfg.caseSensitive);
    if (!isValidSlug(slug)) throw badRequest('Invalid slug');
    if (slug !== current.slug) {
      newSlug = slug;
      set('slug', slug);
    }
  }
  if (input.url !== undefined) set('url', input.url);
  for (const k of ['title', 'description', 'notes'] as const) if (input[k] !== undefined) set(k, input[k]);
  if (input.image !== undefined) set('image', input.image ?? '');
  if (input.tags !== undefined) set('tags', JSON.stringify(dedupe(input.tags)));
  if (input.redirect_code !== undefined) set('redirect_code', input.redirect_code);
  if (input.forward_query !== undefined) set('forward_query', input.forward_query ? 1 : 0);
  if (input.utm !== undefined) set('utm', JSON.stringify(clean(input.utm)));
  if (input.rules !== undefined) set('rules', JSON.stringify(input.rules));
  if (input.variants !== undefined) set('variants', JSON.stringify(input.variants));
  if (input.password !== undefined) set('password_hash', input.password ? await hashPassword(input.password) : null);
  if (input.warning !== undefined) set('warning', input.warning ? 1 : 0);
  if (input.starts_at !== undefined) set('starts_at', input.starts_at);
  if (input.expires_at !== undefined) set('expires_at', input.expires_at);
  if (input.expired_url !== undefined) set('expired_url', input.expired_url);
  if (input.max_clicks !== undefined) set('max_clicks', input.max_clicks);
  if (input.disabled !== undefined) set('disabled', input.disabled ? 1 : 0);
  if (!sets.length) return toLink(current, origin);
  // Ensure the cache version changes even if two edits happen in the same millisecond.
  sets.push('updated_at = MAX(updated_at + 1, ?)');
  args.push(Date.now());

  try {
    await env.DB.prepare(`UPDATE links SET ${sets.join(', ')} WHERE id = ?`).bind(...args, current.id).run();
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw conflict(`The slug "${newSlug}" is already taken`);
    throw err;
  }
  await purgeCache(env, current.slug, ...(newSlug ? [newSlug] : []));
  await audit(env.DB, p, 'link.update', newSlug ?? current.slug, Object.keys(input).join(','));
  return toLink((await getLinkRow(env.DB, current.id))!, origin);
}

export async function deleteLinks(env: Bindings, ids: string[], p: Principal | null) {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(`SELECT id, slug FROM links WHERE id IN (${placeholders}) OR slug IN (${placeholders})`)
    .bind(...ids, ...ids)
    .all<{ id: string; slug: string }>();
  if (!results.length) return 0;
  const found = results.map((r) => r.id);
  const ph = found.map(() => '?').join(',');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM links WHERE id IN (${ph})`).bind(...found),
    env.DB.prepare(`DELETE FROM clicks WHERE link_id IN (${ph})`).bind(...found),
  ]);
  await purgeCache(env, ...results.map((r) => r.slug));
  await audit(env.DB, p, 'link.delete', results.map((r) => r.slug).join(', '));
  return results.length;
}

export async function setDisabled(env: Bindings, ids: string[], disabled: boolean, p: Principal | null) {
  if (!ids.length) return 0;
  const ph = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(`UPDATE links SET disabled = ?, updated_at = MAX(updated_at + 1, ?) WHERE id IN (${ph}) RETURNING slug`)
    .bind(disabled ? 1 : 0, Date.now(), ...ids)
    .all<{ slug: string }>();
  await purgeCache(env, ...results.map((r) => r.slug));
  await audit(env.DB, p, disabled ? 'link.disable' : 'link.enable', results.map((r) => r.slug).join(', '));
  return results.length;
}

export async function addTags(env: Bindings, ids: string[], tags: string[], p: Principal | null) {
  let n = 0;
  const affectedSlugs: string[] = [];
  for (const id of ids) {
    const row = await getLinkRow(env.DB, id);
    if (!row) continue;
    const next = dedupe([...json<string[]>(row.tags, []), ...tags]);
    await env.DB.prepare('UPDATE links SET tags = ?, updated_at = MAX(updated_at + 1, ?) WHERE id = ?').bind(JSON.stringify(next), Date.now(), row.id).run();
    affectedSlugs.push(row.slug);
    n++;
  }
  await purgeCache(env, ...affectedSlugs);
  await audit(env.DB, p, 'link.tag', `${n} links`, tags.join(','));
  return n;
}

function dedupe(tags: string[]) {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
}

function clean(utm: Utm): Utm {
  return Object.fromEntries(Object.entries(utm).filter(([, v]) => !!v)) as Utm;
}
