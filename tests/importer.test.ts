import { describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/worker/lib/crypto';
import { convertSinkPasswordHash, normaliseImport } from '../src/worker/services/importer';
import { sinkHash } from './sink-fixtures';

describe('Sink password hashes', () => {
  it('convert to a Hoplane hash that verifies the original password', async () => {
    const converted = convertSinkPasswordHash(await sinkHash('correct horse'));
    expect(converted).toMatch(/^pbkdf2\$10000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(await verifyPassword('correct horse', converted)).toBe(true);
    expect(await verifyPassword('wrong horse', converted)).toBe(false);
  });

  it('reject malformed or out-of-range hashes', async () => {
    expect(convertSinkPasswordHash('plain-password')).toBeNull();
    expect(convertSinkPasswordHash('sink-pwd:v1:10000:not*base64:abc:def')).toBeNull();
    expect(convertSinkPasswordHash('sink-pwd:v1:10000:AAAA:AAAA:abc')).toBeNull(); // wrong lengths
    expect(convertSinkPasswordHash(await sinkHash('x', 10))).toBeNull(); // too weak
    expect(convertSinkPasswordHash(await sinkHash('x', 100_001))).toBeNull(); // verifyPassword would refuse it
  });
});

describe('normaliseImport', () => {
  const sinkBase = { id: 'abc', slug: 'promo', url: 'https://example.com/', createdAt: 1_700_000_000, updatedAt: 1_700_000_000, tags: [] };

  it('maps Sink device and country targets to rules, device first', () => {
    const { input } = normaliseImport({
      ...sinkBase,
      geo: { de: 'https://de.example.com/', AT: 'https://de.example.com/', FR: 'https://fr.example.com/' },
      apple: 'https://apps.apple.com/app/id1',
      google: 'https://play.google.com/store/apps/details?id=x',
    });
    expect(input.rules).toEqual([
      { field: 'os', op: 'in', values: ['iOS', 'iPadOS'], url: 'https://apps.apple.com/app/id1' },
      { field: 'os', op: 'in', values: ['Android'], url: 'https://play.google.com/store/apps/details?id=x' },
      { field: 'country', op: 'in', values: ['DE', 'AT'], url: 'https://de.example.com/' },
      { field: 'country', op: 'in', values: ['FR'], url: 'https://fr.example.com/' },
    ]);
  });

  it('maps unsafe and query forwarding, defaulting forwarding off like Sink', () => {
    expect(normaliseImport({ ...sinkBase, unsafe: true }).input).toMatchObject({ warning: true, forward_query: false });
    expect(normaliseImport({ ...sinkBase, redirectWithQuery: true }).input.forward_query).toBe(true);
    // Non-Sink rows keep Hoplane's default (unset → forward).
    expect(normaliseImport({ url: 'https://example.com', slug: 'x' }).input.forward_query).toBeUndefined();
  });

  it('converts Sink password hashes and refuses masked ones', async () => {
    const hashed = normaliseImport({ ...sinkBase, password: await sinkHash('hunter22') });
    expect(hashed.input.password).toBeUndefined();
    expect(await verifyPassword('hunter22', hashed.passwordHash)).toBe(true);

    const masked = normaliseImport({ ...sinkBase, password: '__SINK_MASKED__•••r22' });
    expect(masked.input.password).toBeUndefined();
    expect(masked.passwordHash).toBeUndefined();
    expect(masked.passwordUnavailable).toMatch(/masked password/);

    // Legacy Sink links and other shorteners may carry a plaintext password.
    expect(normaliseImport({ ...sinkBase, password: 'plain' }).input.password).toBe('plain');
  });

  it('drops relative images, truncates long text, and notes unsupported Sink modes', () => {
    const r = normaliseImport({ ...sinkBase, image: '/_assets/images/a.png', title: 't'.repeat(256), cloaking: true, proxy: true });
    expect(r.input.image).toBeUndefined();
    expect(r.input.title).toHaveLength(200);
    expect(r.warnings).toHaveLength(4);
  });

  it('keeps explicit Hoplane fields over Sink equivalents', () => {
    const rules = [{ field: 'country', op: 'in', values: ['US'], url: 'https://us.example.com/' }];
    const { input } = normaliseImport({ ...sinkBase, geo: { DE: 'https://de.example.com/' }, rules, warning: false, unsafe: true, forward_query: true });
    expect(input).toMatchObject({ rules, warning: false, forward_query: true });
  });

  it('still requires a new password for protected Hoplane exports', () => {
    expect(normaliseImport({ url: 'https://example.com', slug: 'p', has_password: true }).passwordUnavailable).toMatch(/new password/);
    expect(normaliseImport({ url: 'https://example.com', slug: 'p', has_password: true, password: 'new' }).passwordUnavailable).toBeUndefined();
  });
});
