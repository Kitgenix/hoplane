/**
 * "Update available" check. The daily maintenance run asks GitHub for the
 * latest published Hoplane release and stores the answer in D1, so dashboards
 * never call GitHub themselves and an instance makes at most one request a day
 * (plus any "Check now" clicks by an admin). Turn it off with UPDATE_CHECK=false.
 *
 * The request sends only a generic User-Agent naming the product and version.
 */
import { KITGENIX } from '../../shared/attribution';
import type { UpdateStatus } from '../../shared/types';
import { VERSION } from '../env';

const KEY = 'latest_release';
const TIMEOUT_MS = 5_000;
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const RELEASES_API = `https://api.github.com/repos/${new URL(KITGENIX.repository).pathname.replace(/^\/|\/$/g, '')}/releases/latest`;

export interface LatestRelease {
  /** Latest published version without a leading "v", or null if no release exists yet. */
  version: string | null;
  url: string | null;
  checked_at: number;
}

/** Semantic-version comparison: negative, zero or positive. Unparseable versions compare equal. */
export function compareVersions(a: string, b: string): number {
  const x = VERSION_RE.exec(a.trim());
  const y = VERSION_RE.exec(b.trim());
  if (!x || !y) return 0;
  for (let i = 1; i <= 3; i++) {
    const d = Number(x[i]) - Number(y[i]);
    if (d) return Math.sign(d);
  }
  const [px, py] = [x[4] ?? null, y[4] ?? null];
  if (px === py) return 0;
  if (px === null) return 1; // 1.2.0 is newer than 1.2.0-beta.1
  if (py === null) return -1;
  return px < py ? -1 : 1;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Fetch the latest release from GitHub and store it. Throws if GitHub cannot be reached. */
export async function checkForUpdate(db: D1Database, fetcher: Fetcher = (input, init) => fetch(input, init), now = Date.now()): Promise<LatestRelease> {
  const res = await fetcher(RELEASES_API, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': `${KITGENIX.product}/${VERSION}`, 'x-github-api-version': '2022-11-28' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let release: LatestRelease = { version: null, url: null, checked_at: now };
  if (res.ok) {
    const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
    const tag = typeof body.tag_name === 'string' ? body.tag_name.trim() : '';
    const url = typeof body.html_url === 'string' && body.html_url.startsWith('https://github.com/') ? body.html_url : null;
    if (VERSION_RE.test(tag)) release = { version: tag.replace(/^v/, ''), url, checked_at: now };
  } else if (res.status !== 404) {
    // 404 means no release has been published yet; anything else is a failed check.
    throw new Error(`GitHub returned HTTP ${res.status}`);
  }
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(KEY, JSON.stringify(release))
    .run();
  return release;
}

export async function getLatestRelease(db: D1Database): Promise<LatestRelease | null> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first<{ value: string }>();
  try {
    return row ? (JSON.parse(row.value) as LatestRelease) : null;
  } catch {
    return null;
  }
}

export function updateStatus(latest: LatestRelease | null, enabled: boolean): UpdateStatus {
  const newer = !!latest?.version && compareVersions(latest.version, VERSION) > 0;
  return {
    enabled,
    current: VERSION,
    latest: latest?.version ?? null,
    url: latest?.url ?? null,
    checked_at: latest?.checked_at ?? null,
    update_available: enabled && newer,
  };
}
