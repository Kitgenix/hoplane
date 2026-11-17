/**
 * Import normalisation for links exported by Hoplane and other shorteners.
 * https://kitgenix.com · https://github.com/Kitgenix/hoplane
 *
 * Pure functions that map one foreign record onto Hoplane's link input.
 * Validation still happens in createLink/updateLink; this module only renames
 * fields, converts formats, and records what could not be carried over.
 */
import type { RoutingRule } from '../../shared/types';
import { PASSWORD_ITERATIONS, toHex } from '../lib/crypto';
import { safeUrl } from '../lib/url';

/** Text limits from linkInput. Longer imported text is truncated with a warning instead of failing the row. */
const TEXT_LIMITS = { title: 200, description: 500, notes: 2000 } as const;
/** linkInput allows at most this many values per routing rule. */
const MAX_RULE_VALUES = 100;

/* ------------------------------------------------------------------ Sink (github.com/miantiao-me/sink) */

export const SINK_PASSWORD_HASH_PREFIX = 'sink-pwd:v1:';
export const SINK_PASSWORD_MASK_PREFIX = '__SINK_MASKED__';
/** Fields that only appear on Sink link records. */
const SINK_KEYS = ['geo', 'apple', 'google', 'unsafe', 'cloaking', 'redirectWithQuery', 'proxy'];
/** Sink's PBKDF2 iteration count is 10,000; refuse anything far weaker or beyond what verifyPassword accepts. */
const MIN_IMPORTED_ITERATIONS = 1_000;

function isSinkRecord(raw: Record<string, unknown>): boolean {
  if (SINK_KEYS.some((k) => raw[k] !== undefined)) return true;
  // Sink stores createdAt as Unix seconds; Hoplane exports use created_at.
  if (typeof raw.createdAt === 'number') return true;
  const pw = raw.password;
  return typeof pw === 'string' && (pw.startsWith(SINK_PASSWORD_HASH_PREFIX) || pw.startsWith(SINK_PASSWORD_MASK_PREFIX));
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Convert a Sink password hash (`sink-pwd:v1:<iterations>:<salt>:<hash>:<tail>`,
 * base64url, PBKDF2-SHA256, 16-byte salt, 256-bit output) to Hoplane's
 * `pbkdf2$<iterations>$<saltHex>$<hashHex>` format. Both use the same KDF, so the
 * original password keeps working. Returns null for anything that does not parse.
 *
 * Caveat: Hoplane NFKC-normalises a password before deriving it and Sink does not.
 * The two agree for ASCII passwords, which covers nearly every link password.
 * The trailing "tail" segment (the last three plaintext characters) is discarded.
 */
export function convertSinkPasswordHash(stored: string): string | null {
  if (!stored.startsWith(SINK_PASSWORD_HASH_PREFIX)) return null;
  const [iter = '', salt64 = '', hash64 = ''] = stored.slice(SINK_PASSWORD_HASH_PREFIX.length).split(':');
  if (!/^[1-9][0-9]*$/.test(iter)) return null;
  const iterations = Number(iter);
  if (iterations < MIN_IMPORTED_ITERATIONS || iterations > PASSWORD_ITERATIONS) return null;
  const salt = base64UrlToBytes(salt64);
  const hash = base64UrlToBytes(hash64);
  if (salt?.length !== 16 || hash?.length !== 32) return null;
  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(hash)}`;
}

/**
 * Sink's device targets (App Store / Play Store URLs) and country map become
 * Hoplane routing rules. Sink gives device targets priority over country targets;
 * Hoplane uses the first matching rule, so device rules go first.
 */
function sinkRules(raw: Record<string, unknown>, warnings: string[]): RoutingRule[] {
  const rules: RoutingRule[] = [];
  if (typeof raw.apple === 'string' && raw.apple.trim()) rules.push({ field: 'os', op: 'in', values: ['iOS', 'iPadOS'], url: raw.apple.trim() });
  if (typeof raw.google === 'string' && raw.google.trim()) rules.push({ field: 'os', op: 'in', values: ['Android'], url: raw.google.trim() });

  const geo = raw.geo;
  if (geo && typeof geo === 'object' && !Array.isArray(geo)) {
    // One rule per destination keeps large country maps within the 25-rule limit.
    const byUrl = new Map<string, string[]>();
    for (const [country, url] of Object.entries(geo as Record<string, unknown>)) {
      const code = country.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(code) || typeof url !== 'string' || !url.trim()) {
        warnings.push(`Skipped country route "${country}" because it is not a two-letter country code with a URL`);
        continue;
      }
      byUrl.set(url.trim(), [...(byUrl.get(url.trim()) ?? []), code]);
    }
    for (const [url, codes] of byUrl) {
      for (let i = 0; i < codes.length; i += MAX_RULE_VALUES) rules.push({ field: 'country', op: 'in', values: codes.slice(i, i + MAX_RULE_VALUES), url });
    }
  }
  return rules;
}

/* ------------------------------------------------------------------ normalisation */

export interface NormalisedImport {
  /** Input for createLink/updateLink. Never carries a password when passwordHash is set. */
  input: Record<string, unknown>;
  /** A password hash already in Hoplane's format, converted from the source system. */
  passwordHash?: string;
  /** Set when the source link was password-protected but its password cannot be carried over. */
  passwordUnavailable?: string;
  /** Settings that were dropped or changed so the row could be imported. */
  warnings: string[];
}

/** Accepts Hoplane exports plus common fields from other shorteners (Sink, Bitly, Shlink, YOURLS). */
export function normaliseImport(raw: Record<string, unknown>): NormalisedImport {
  const warnings: string[] = [];
  const pick = (...keys: string[]) => {
    for (const k of keys) if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return raw[k];
    return undefined;
  };
  const tags = pick('tags');
  const toMs = (v: unknown): unknown => {
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

  if (isSinkRecord(raw)) {
    if (out.rules === undefined) {
      const rules = sinkRules(raw, warnings);
      if (rules.length) out.rules = rules;
    }
    if (out.warning === undefined && typeof raw.unsafe === 'boolean') out.warning = raw.unsafe;
    // Sink does not forward query strings unless asked to; Hoplane's default is to forward.
    if (out.forward_query === undefined) out.forward_query = raw.redirectWithQuery === true;
    if (raw.cloaking === true) warnings.push('Cloaking is not supported, so this link redirects normally');
    if (raw.proxy === true) warnings.push('Reverse proxy mode is not supported, so this link redirects normally');
  }

  // Images uploaded to another shortener are often stored as relative paths that
  // only resolve on that instance. Drop them rather than failing the whole row.
  if (typeof out.image === 'string' && !safeUrl(out.image)) {
    warnings.push(`Preview image "${out.image.slice(0, 80)}" is not a full http(s) URL and was not imported`);
    delete out.image;
  }
  for (const [k, max] of Object.entries(TEXT_LIMITS)) {
    const v = out[k];
    if (typeof v === 'string' && v.trim().length > max) {
      out[k] = v.trim().slice(0, max);
      warnings.push(`${k[0].toUpperCase()}${k.slice(1)} was shortened to ${max} characters`);
    }
  }

  const result: NormalisedImport = { input: out, warnings };
  const pw = out.password;
  if (typeof pw === 'string' && pw.startsWith(SINK_PASSWORD_MASK_PREFIX)) {
    delete out.password;
    result.passwordUnavailable = 'This link is password-protected, but the file only contains a masked password. Replace its "password" value with a new password and import again';
  } else if (typeof pw === 'string' && pw.startsWith(SINK_PASSWORD_HASH_PREFIX)) {
    delete out.password;
    const hash = convertSinkPasswordHash(pw);
    if (hash) result.passwordHash = hash;
    else result.passwordUnavailable = 'This link is password-protected, but its password hash is in an unsupported format. Replace its "password" value with a new password and import again';
  } else if (raw.has_password === true && !pw) {
    // Hoplane exports contain only a has_password flag, never the password or hash.
    result.passwordUnavailable = 'Protected links need a new password when imported; exported password hashes are not included';
  }

  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return result;
}
