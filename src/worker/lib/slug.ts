/** Paths the application owns; these can never be used as short-link slugs. */
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'assets', 'dashboard', 'login', 'logout', 'health', 'robots.txt',
  'favicon.ico', 'favicon.svg', 'sitemap.xml', '.well-known', 'kitgenix',
]);

// Letters, numbers, hyphens and underscores; may include single "/" separators (e.g. "promo/summer").
const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\/[a-zA-Z0-9_-]+)*$/;

export function normaliseSlug(raw: string, caseSensitive: boolean): string {
  const s = raw.trim().replace(/^\/+|\/+$/g, '');
  return caseSensitive ? s : s.toLowerCase();
}

export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length > 128 || !SLUG_RE.test(slug)) return false;
  return !RESERVED_SLUGS.has(slug.toLowerCase().split('/')[0]);
}

// No look-alike characters (0/o, 1/l/i).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function randomSlug(length: number): string {
  const out: string[] = [];
  // Rejection sampling avoids modulo bias.
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < 248 && out.length < length) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join('');
}

/** Turn a page title into a readable slug suggestion: "Summer Sale 2026 | Shop" → "summer-sale-2026". */
export function slugify(text: string, max = 32): string {
  const base = text
    .split(/\s[|–—·:-]\s/)[0]
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  return cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : cut;
}
