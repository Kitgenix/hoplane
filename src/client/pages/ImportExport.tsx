import { CheckCircle2, Download, FileUp, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { PageHeader } from '../components/Layout';
import { Badge, Button, Card, Field, Select, cx, useToast } from '../components/ui';
import { api, download } from '../lib/api';
import { num } from '../lib/format';
import { useSession } from '../lib/hooks';

/** RFC 4180-ish CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').replace(/^'(?=[=+\-@])/, '').trim()])));
}

function parseFile(name: string, text: string): Record<string, unknown>[] {
  if (name.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : Array.isArray(data.links) ? data.links : null;
    if (!list) throw new Error('JSON must be an array of links or an object with a "links" array');
    return list;
  }
  return parseCsv(text);
}

interface Result {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; slug?: string; error: string }[];
}

export function ImportExportPage() {
  const { can } = useSession();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'skip' | 'overwrite'>('skip');
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [drag, setDrag] = useState(false);

  const load = async (file: File) => {
    setResult(null);
    try {
      const parsed = parseFile(file.name.toLowerCase(), await file.text());
      if (!parsed.length) throw new Error('No rows found');
      setRows(parsed);
      setFileName(file.name);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that file', 'bad');
    }
  };

  const run = async () => {
    if (!rows) return;
    const total: Result = { created: 0, updated: 0, skipped: 0, errors: [] };
    const size = 200;
    for (let i = 0; i < rows.length; i += size) {
      setProgress(i / rows.length);
      const r = await api<Result>('/import', { body: { links: rows.slice(i, i + size), on_conflict: mode } });
      total.created += r.created;
      total.updated += r.updated;
      total.skipped += r.skipped;
      total.errors.push(...r.errors.map((e) => ({ ...e, row: e.row + i })));
    }
    setProgress(null);
    setResult(total);
    setRows(null);
    toast(`Imported ${total.created + total.updated} links`, 'good');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) load(f);
  };

  const preview = rows?.slice(0, 5) ?? [];
  const pick = (r: Record<string, unknown>, ...k: string[]) => String(k.map((x) => r[x]).find((v) => v !== undefined && v !== '') ?? '');

  return (
    <>
      <PageHeader title="Import & export" description="Move links in and out of your instance. Your data is always yours." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Import links" description="JSON or CSV. Works with exports from Hoplane and most other shorteners.">
          {!can('links:write') ? (
            <p className="text-sm text-muted">Your role cannot create links.</p>
          ) : (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => input.current?.click()}
                className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition', drag ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/50')}
              >
                <FileUp className="size-7 text-brand-fg" />
                <p className="font-medium">{fileName && rows ? fileName : 'Drop a file here or click to browse'}</p>
                <p className="text-xs text-muted">{rows ? `${num(rows.length)} links ready to import` : '.json or .csv, up to tens of thousands of rows'}</p>
                <input ref={input} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
              </div>

              {rows && (
                <>
                  <div className="overflow-x-auto rounded-lg border border-line">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-surface-2 text-xs text-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">Slug</th>
                          <th className="px-3 py-2 font-medium">Destination</th>
                          <th className="px-3 py-2 font-medium">Title</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {preview.map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-mono">{pick(r, 'slug', 'keyword', 'short_code', 'shortCode', 'back_half') || <span className="text-muted">auto</span>}</td>
                            <td className="max-w-64 truncate px-3 py-2">{pick(r, 'url', 'long_url', 'longUrl', 'destination', 'target', 'original_url')}</td>
                            <td className="max-w-40 truncate px-3 py-2">{pick(r, 'title', 'name')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <Field label="If a slug already exists" className="flex-1">
                      <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                        <option value="skip">Skip it and keep the existing link</option>
                        <option value="overwrite">Overwrite the existing link</option>
                      </Select>
                    </Field>
                    <Button variant="primary" icon={<Upload className="size-4" />} loading={progress !== null} onClick={run}>
                      {progress !== null ? `Importing ${Math.round(progress * 100)}%` : `Import ${num(rows.length)} links`}
                    </Button>
                  </div>
                </>
              )}

              {result && (
                <div className="rounded-xl border border-line p-4">
                  <p className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="size-5 text-good-fg" /> Import finished
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone="good">{result.created} created</Badge>
                    <Badge tone="brand">{result.updated} updated</Badge>
                    <Badge>{result.skipped} skipped</Badge>
                    {result.errors.length > 0 && <Badge tone="bad">{result.errors.length} failed</Badge>}
                  </div>
                  {result.errors.length > 0 && (
                    <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
                      {result.errors.map((e) => (
                        <li key={e.row} className="text-muted">
                          Row {e.row}
                          {e.slug ? ` (${e.slug})` : ''}: <span className="text-bad-fg">{e.error}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <details className="text-sm text-muted">
                <summary className="cursor-pointer font-medium text-text">Supported columns</summary>
                <p className="mt-2">
                  <code className="font-mono text-text">url</code> (required; also <code>long_url</code>, <code>destination</code>), <code className="font-mono text-text">slug</code> (also <code>keyword</code>, <code>short_code</code>, <code>back_half</code>),{' '}
                  <code>title</code>, <code>description</code>, <code>tags</code> (comma-separated), <code>notes</code> / <code>comment</code>, <code>expires_at</code> / <code>expiration</code>, plus every field from a Hoplane JSON export.
                </p>
              </details>
            </div>
          )}
        </Card>

        <Card title="Export links" description="Download every link with its settings and click totals.">
          <div className="space-y-3">
            <Button className="w-full justify-start" icon={<Download className="size-4" />} onClick={() => download('/export', { format: 'json' })}>
              JSON: full backup, re-importable
            </Button>
            <Button className="w-full justify-start" icon={<Download className="size-4" />} onClick={() => download('/export', { format: 'csv' })}>
              CSV: for spreadsheets
            </Button>
            <p className="pt-2 text-xs text-muted">Passwords are never exported. For click-level data, use “Export CSV” on the Analytics page.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
