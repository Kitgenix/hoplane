import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/worker/lib/crypto';
import { isValidSlug, normaliseSlug, randomSlug, slugify } from '../src/worker/lib/slug';
import { buildDestination, isBlockedHost, safeUrl } from '../src/worker/lib/url';
import { browserOf, deviceOf, isBot, isSocialCrawler, osOf } from '../src/worker/lib/visitor';
import { splitSql, MIGRATIONS } from '../src/worker/migrate';
import { matchRule, pickVariant } from '../src/worker/redirect';
import { toCsv } from '../src/worker/services/analytics';
import type { VisitorContext } from '../src/worker/lib/visitor';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

describe('urls', () => {
  it('accepts only http(s) without credentials', () => {
    expect(safeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('https://user:pw@example.com')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });

  it('matches blocked domains and subdomains only', () => {
    expect(isBlockedHost('evil.com', ['evil.com'])).toBe(true);
    expect(isBlockedHost('a.b.evil.com', ['*.evil.com'])).toBe(true);
    expect(isBlockedHost('notevil.com', ['evil.com'])).toBe(false);
  });

  it('appends UTM and forwards query without overriding', () => {
    const out = new URL(
      buildDestination('https://shop.test/p?utm_source=keep', {
        utm: { source: 'ignored', medium: 'email' },
        forwardFrom: new URLSearchParams('ref=tw&qr&utm_medium=x'),
      }),
    );
    expect(out.searchParams.get('utm_source')).toBe('keep');
    expect(out.searchParams.get('utm_medium')).toBe('email'); // configured UTM takes priority over forwarded query parameters
    expect(out.searchParams.get('ref')).toBe('tw');
    expect(out.searchParams.has('qr')).toBe(false);
  });
});

describe('slugs', () => {
  it('validates and rejects reserved words', () => {
    expect(isValidSlug('launch')).toBe(true);
    expect(isValidSlug('promo/summer-2026')).toBe(true);
    expect(isValidSlug('api')).toBe(false);
    expect(isValidSlug('dashboard/x')).toBe(false);
    expect(isValidSlug('a//b')).toBe(false);
    expect(isValidSlug('-x')).toBe(false);
    expect(isValidSlug('has space')).toBe(false);
  });
  it('normalises case unless case-sensitive', () => {
    expect(normaliseSlug('/Hello/', false)).toBe('hello');
    expect(normaliseSlug('Hello', true)).toBe('Hello');
  });
  it('generates unambiguous random slugs', () => {
    const s = randomSlug(12);
    expect(s).toHaveLength(12);
    expect(s).not.toMatch(/[01ilo]/);
  });
  it('slugifies titles', () => {
    expect(slugify('Summer Sale 2026 | Big Shop')).toBe('summer-sale-2026');
    expect(slugify('Café déjà vu')).toBe('cafe-deja-vu');
  });
});

describe('visitor classification', () => {
  it('detects devices, OS and browsers', () => {
    expect(deviceOf(IPHONE)).toBe('mobile');
    expect(osOf(IPHONE)).toBe('iOS');
    expect(browserOf(IPHONE)).toBe('Safari');
    expect(deviceOf(MAC_CHROME)).toBe('desktop');
    expect(osOf(MAC_CHROME)).toBe('macOS');
    expect(browserOf(MAC_CHROME)).toBe('Chrome');
  });
  it('detects bots and link-preview crawlers', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBot('curl/8.0')).toBe(true);
    expect(isBot(MAC_CHROME)).toBe(false);
    expect(isSocialCrawler('Slackbot-LinkExpanding 1.0')).toBe(true);
    expect(isSocialCrawler('facebookexternalhit/1.1')).toBe(true);
    expect(isSocialCrawler(MAC_CHROME)).toBe(false);
  });
});

describe('routing', () => {
  const v = { country: 'GB', continent: 'EU', device: 'mobile', os: 'iOS', browser: 'Safari', language: 'en', referrer: 'm.twitter.com' } as VisitorContext;
  it('matches rules case-insensitively', () => {
    expect(matchRule({ field: 'country', op: 'in', values: ['gb', 'ie'], url: 'x' }, v)).toBe(true);
    expect(matchRule({ field: 'device', op: 'not_in', values: ['mobile'], url: 'x' }, v)).toBe(false);
    expect(matchRule({ field: 'referrer', op: 'in', values: ['twitter.com'], url: 'x' }, v)).toBe(true);
  });
  it('picks weighted variants', () => {
    const vs = [{ url: 'a', weight: 1 }, { url: 'b', weight: 3 }];
    expect(pickVariant(vs, 0)).toBe(0);
    expect(pickVariant(vs, 0.3)).toBe(1);
    expect(pickVariant(vs, 0.999)).toBe(1);
    expect(pickVariant([{ url: 'a', weight: 0 }], 0.5)).toBeNull();
  });
});

describe('crypto', () => {
  it('hashes and verifies passwords', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h.startsWith('pbkdf2$')).toBe(true);
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('misc', () => {
  it('splits migrations into statements', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    const stmts = splitSql(MIGRATIONS[0].sql);
    expect(stmts.some((s) => s.startsWith('CREATE TABLE IF NOT EXISTS links'))).toBe(true);
    expect(stmts.every((s) => !s.includes('--'))).toBe(true);
  });
  it('escapes CSV formulas', () => {
    const csv = toCsv(['a'], [['=HYPERLINK("x")'], ['plain']]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('plain');
  });
});
