import type { Principal } from '../env';

export interface Settings {
  blocked_domains: string[];
  /** Show the "you are leaving" warning page for every link, not just flagged ones. */
  warn_all: boolean;
  /** Record clicks from bots/crawlers in analytics (off by default). */
  track_bots: boolean;
  /** Reject new or edited links whose destination Cloudflare's security DNS blocks (malware, phishing). */
  safe_browsing: boolean;
  /** Daily destination checks (services/health.ts). */
  health_checks: boolean;
}

const DEFAULTS: Settings = { blocked_domains: [], warn_all: false, track_bots: false, safe_browsing: false, health_checks: false };
let cached: { at: number; value: Settings } | null = null;
const TTL = 30_000;

export async function getSettings(db: D1Database, fresh = false): Promise<Settings> {
  if (!fresh && cached && Date.now() - cached.at < TTL) return cached.value;
  const { results } = await db.prepare("SELECT key, value FROM settings WHERE key IN ('blocked_domains','warn_all','track_bots','safe_browsing','health_checks')").all<{ key: string; value: string }>();
  const value: Settings = { ...DEFAULTS };
  for (const r of results) {
    try {
      (value as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
    } catch {}
  }
  cached = { at: Date.now(), value };
  return value;
}

export async function saveSettings(db: D1Database, patch: Partial<Settings>) {
  const stmts = Object.entries(patch)
    .filter(([k]) => k in DEFAULTS)
    .map(([k, v]) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, JSON.stringify(v)));
  if (stmts.length) await db.batch(stmts);
  cached = null;
}

export function clearSettingsCache() {
  cached = null;
}

export async function audit(db: D1Database, p: Principal | null, action: string, target = '', detail = '') {
  await db
    .prepare('INSERT INTO audit_log (ts, user_id, actor, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(Date.now(), p?.userId ?? null, p ? `${p.email}${p.via === 'api_key' ? ' (API key)' : ''}` : 'system', action, target.slice(0, 200), detail.slice(0, 1000))
    .run();
}
