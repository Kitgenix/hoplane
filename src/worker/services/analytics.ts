import type { BreakdownRow, Dimension, LiveEvent, SeriesPoint, Summary } from '../../shared/types';
import { randomToken, sha256 } from '../lib/crypto';
import { badRequest } from '../lib/errors';
import type { VisitorContext } from '../lib/visitor';

/* ------------------------------------------------------------------ recording */

let saltCache: { day: string; salt: string } | null = null;

/**
 * Random per-day salt. Yesterday's salt is deleted by the daily job, so a
 * visitor hash cannot be linked to the same person on another day or reversed to an IP.
 */
export async function dailySalt(db: D1Database, now = Date.now()): Promise<string> {
  const day = new Date(now).toISOString().slice(0, 10);
  if (saltCache?.day === day) return saltCache.salt;
  const key = `salt:${day}`;
  await db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(key, randomToken(24)).run();
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  saltCache = { day, salt: row!.value };
  return saltCache.salt;
}

export interface ClickExtra {
  source: 'link' | 'qr';
  variant: number | null;
  destination: string;
}

export async function recordClick(db: D1Database, linkId: string, v: VisitorContext, extra: ClickExtra) {
  const now = Date.now();
  const salt = await dailySalt(db, now);
  const visitor = v.ip || v.ua ? (await sha256(`${salt}|${v.ip}|${v.ua}`)).slice(0, 16) : null;
  await db.batch([
    db
      .prepare(
        `INSERT INTO clicks (link_id, ts, visitor, country, region, city, continent, latitude, longitude, referrer, device, os, browser, language, source, variant, destination)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        linkId, now, visitor, v.country, v.region, v.city, v.continent, v.latitude, v.longitude, v.referrer,
        v.device, v.os, v.browser, v.language, extra.source, extra.variant, extra.destination.slice(0, 2048),
      ),
    db.prepare('UPDATE links SET clicks = clicks + 1, last_clicked_at = ? WHERE id = ?').bind(now, linkId),
  ]);
}

/* ------------------------------------------------------------------ queries */

export interface Range {
  from: number;
  to: number;
  link?: string | null;
  /** Viewer's UTC offset in minutes (e.g. 60 for UTC+1); used to align day buckets with local midnight. */
  tz?: number;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function parseRange(params: URLSearchParams): Range {
  const now = Date.now();
  const num = (k: string) => {
    const v = params.get(k);
    if (!v) return null;
    const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
    return Number.isFinite(n) ? n : null;
  };
  // Ranges are [from, to). Default `to` is just past now so a click recorded in this same
  // millisecond is included (the Workers clock does not advance during a request).
  const to = num('to') ?? now + 1;
  const from = num('from') ?? to - 7 * DAY;
  if (from >= to) throw badRequest('"from" must be before "to"');
  if (to - from > 3 * 366 * DAY) throw badRequest('Range is limited to 3 years');
  const tz = Number(params.get('tz') ?? 0);
  return { from, to, link: params.get('link') || null, tz: Number.isFinite(tz) ? Math.max(-840, Math.min(840, Math.trunc(tz))) : 0 };
}

function where(r: Range, prefix = '') {
  const parts = [`${prefix}ts >= ?`, `${prefix}ts < ?`];
  const args: unknown[] = [r.from, r.to];
  if (r.link) {
    parts.push(`${prefix}link_id = ?`);
    args.push(r.link);
  }
  return { sql: parts.join(' AND '), args };
}

export async function summary(db: D1Database, r: Range): Promise<Summary> {
  const cur = where(r);
  const span = r.to - r.from;
  const prev = where({ ...r, from: r.from - span, to: r.from });
  const linkFilter = r.link ? 'WHERE id = ?' : '';
  const linkArgs = r.link ? [r.link] : [];
  const now = Date.now();
  const [a, b, c] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS clicks, COUNT(DISTINCT visitor) AS visitors, SUM(source = 'qr') AS qr FROM clicks WHERE ${cur.sql}`).bind(...cur.args),
    db.prepare(`SELECT COUNT(*) AS clicks, COUNT(DISTINCT visitor) AS visitors FROM clicks WHERE ${prev.sql}`).bind(...prev.args),
    db
      .prepare(
        `SELECT COUNT(*) AS links, SUM(disabled = 0 AND (expires_at IS NULL OR expires_at > ?) AND (starts_at IS NULL OR starts_at <= ?) AND (max_clicks IS NULL OR clicks < max_clicks)) AS active FROM links ${linkFilter}`,
      )
      .bind(now, now, ...linkArgs),
  ]);
  const x = a.results[0] as { clicks: number; visitors: number; qr: number | null };
  const y = b.results[0] as { clicks: number; visitors: number };
  const z = c.results[0] as { links: number; active: number | null };
  return {
    clicks: x.clicks,
    visitors: x.visitors,
    qr: x.qr ?? 0,
    links: z.links,
    active_links: z.active ?? 0,
    previous: { clicks: y.clicks, visitors: y.visitors },
  };
}

export async function timeseries(db: D1Database, r: Range, interval?: 'hour' | 'day'): Promise<{ interval: 'hour' | 'day'; points: SeriesPoint[] }> {
  const unit = interval ?? (r.to - r.from <= 2 * DAY ? 'hour' : 'day');
  const size = unit === 'hour' ? HOUR : DAY;
  const off = (r.tz ?? 0) * 60_000;
  const w = where(r);
  const { results } = await db
    .prepare(
      `SELECT CAST((ts + ${off}) / ${size} AS INTEGER) * ${size} - ${off} AS t, COUNT(*) AS clicks, COUNT(DISTINCT visitor) AS visitors FROM clicks WHERE ${w.sql} GROUP BY t ORDER BY t`,
    )
    .bind(...w.args)
    .all<SeriesPoint>();
  // Fill empty buckets so charts have a continuous axis.
  const byT = new Map(results.map((p) => [p.t, p]));
  const start = Math.floor((r.from + off) / size) * size - off;
  const points: SeriesPoint[] = [];
  for (let t = start; t < r.to && points.length < 2000; t += size) points.push(byT.get(t) ?? { t, clicks: 0, visitors: 0 });
  return { interval: unit, points };
}

const COLUMNS: Record<Exclude<Dimension, 'link'>, string> = {
  country: 'country',
  region: "COALESCE(region, '') || CASE WHEN country IS NOT NULL THEN ', ' || country ELSE '' END",
  city: "COALESCE(city, '') || CASE WHEN country IS NOT NULL THEN ', ' || country ELSE '' END",
  continent: 'continent',
  referrer: 'referrer',
  device: 'device',
  os: 'os',
  browser: 'browser',
  language: 'language',
  source: 'source',
};

export async function breakdown(db: D1Database, r: Range, dim: Dimension, limit = 10): Promise<BreakdownRow[]> {
  const w = where(r, 'c.');
  const lim = Math.min(250, Math.max(1, limit));
  if (dim === 'link') {
    const { results } = await db
      .prepare(
        `SELECT c.link_id AS key, l.slug AS label, COUNT(*) AS clicks, COUNT(DISTINCT c.visitor) AS visitors
         FROM clicks c LEFT JOIN links l ON l.id = c.link_id WHERE ${w.sql} GROUP BY c.link_id ORDER BY clicks DESC LIMIT ${lim}`,
      )
      .bind(...w.args)
      .all<BreakdownRow>();
    return results;
  }
  const col = COLUMNS[dim];
  if (!col) throw badRequest('Unknown dimension');
  const plain = where(r);
  const { results } = await db
    .prepare(`SELECT ${col} AS key, COUNT(*) AS clicks, COUNT(DISTINCT visitor) AS visitors FROM clicks WHERE ${plain.sql} GROUP BY key ORDER BY clicks DESC LIMIT ${lim}`)
    .bind(...plain.args)
    .all<BreakdownRow>();
  return results.map((x) => ({ ...x, key: x.key || '' }));
}

export async function live(db: D1Database, opts: { since?: number; link?: string | null; limit?: number }): Promise<LiveEvent[]> {
  const parts = ['c.id > ?'];
  const args: unknown[] = [opts.since ?? 0];
  if (opts.link) {
    parts.push('c.link_id = ?');
    args.push(opts.link);
  }
  const { results } = await db
    .prepare(
      `SELECT c.id, c.ts, l.slug, c.country, c.city, c.device, c.browser, c.os, c.referrer, c.source, c.latitude, c.longitude
       FROM clicks c LEFT JOIN links l ON l.id = c.link_id WHERE ${parts.join(' AND ')} ORDER BY c.id DESC LIMIT ?`,
    )
    .bind(...args, Math.min(100, opts.limit ?? 30))
    .all<LiveEvent>();
  return results;
}

export async function exportClicksCsv(db: D1Database, r: Range): Promise<string> {
  const w = where(r, 'c.');
  const { results } = await db
    .prepare(
      `SELECT c.ts, l.slug, c.country, c.region, c.city, c.referrer, c.device, c.os, c.browser, c.language, c.source, c.variant, c.destination
       FROM clicks c LEFT JOIN links l ON l.id = c.link_id WHERE ${w.sql} ORDER BY c.ts DESC LIMIT 100000`,
    )
    .bind(...w.args)
    .all<Record<string, unknown>>();
  const cols = ['time', 'slug', 'country', 'region', 'city', 'referrer', 'device', 'os', 'browser', 'language', 'source', 'variant', 'destination'];
  const rows = results.map((r) => [new Date(r.ts as number).toISOString(), ...cols.slice(1).map((c) => r[c])]);
  return toCsv(cols, rows);
}

/** CSV with spreadsheet formula-injection protection. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}
