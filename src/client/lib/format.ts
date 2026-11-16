const nf = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
let regionNames: Intl.DisplayNames | null = null;
try {
  regionNames = new Intl.DisplayNames(undefined, { type: 'region' });
} catch {}
let languageNames: Intl.DisplayNames | null = null;
try {
  languageNames = new Intl.DisplayNames(undefined, { type: 'language' });
} catch {}

export const num = (n: number | null | undefined) => nf.format(n ?? 0);
export const short = (n: number | null | undefined) => ((n ?? 0) >= 10_000 ? compact.format(n ?? 0) : nf.format(n ?? 0));

export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

export function flag(code?: string | null) {
  if (!code || !/^[A-Z]{2}$/i.test(code) || code.toUpperCase() === 'XX' || code.toUpperCase() === 'T1') return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function countryName(code?: string | null) {
  if (!code) return 'Unknown';
  if (code === 'T1') return 'Tor network';
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const CONTINENTS: Record<string, string> = { AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America' };
export const continentName = (c?: string | null) => (c ? CONTINENTS[c] ?? c : 'Unknown');

export function languageName(code?: string | null) {
  if (!code) return 'Unknown';
  try {
    return languageNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function dateTime(ms: number | null | undefined) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function date(ms: number | null | undefined) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
export function ago(ms: number | null | undefined) {
  if (!ms) return 'Never';
  const s = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return date(ms);
}

/** Value for <input type="datetime-local"> from epoch ms (local time). */
export function toLocalInput(ms: number | null | undefined) {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
