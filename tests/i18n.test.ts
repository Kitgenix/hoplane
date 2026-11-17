import { describe, expect, it } from 'vitest';
import { LOCALES, MESSAGES, negotiateLocale } from '../src/worker/lib/i18n';

function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
}

describe('visitor page translations', () => {
  it('cover every message in every locale', () => {
    const keys = strings(MESSAGES.en).map(([k]) => k);
    for (const locale of LOCALES) {
      const entries = strings(MESSAGES[locale]);
      expect(entries.map(([k]) => k), locale).toEqual(keys);
      for (const [key, text] of entries) {
        expect(text.trim(), `${locale} ${key}`).not.toBe('');
        expect(text, `${locale} ${key} must be plain text`).not.toMatch(/[<>]/);
      }
      expect(MESSAGES[locale].warning.heading.split('{host}'), `${locale} warning.heading`).toHaveLength(2);
    }
  });

  it('negotiate from Accept-Language', () => {
    expect(negotiateLocale(null)).toBe('en');
    expect(negotiateLocale('')).toBe('en');
    expect(negotiateLocale('de-AT,de;q=0.9,en;q=0.8')).toBe('de');
    expect(negotiateLocale('sv-SE, fr;q=0.7, en;q=0.5')).toBe('fr'); // first supported preference
    expect(negotiateLocale('en;q=0.4, ja;q=0.9')).toBe('ja'); // q-values, not order
    expect(negotiateLocale('pt-PT')).toBe('pt-BR');
    expect(negotiateLocale('zh-Hans-CN')).toBe('zh-CN');
    expect(negotiateLocale('zh-TW, en;q=0.5')).toBe('en'); // no Traditional Chinese yet
    expect(negotiateLocale('fr;q=0, es')).toBe('es');
    expect(negotiateLocale('*')).toBe('en');
    expect(negotiateLocale('x'.repeat(10_000))).toBe('en');
  });
});
