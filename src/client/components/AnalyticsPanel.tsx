import { ArrowDownRight, ArrowUpRight, Download, Globe, Link2, MousePointerClick, QrCode, Radio, RefreshCw, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import type { BreakdownRow, Dimension, LiveEvent, SeriesPoint, Summary } from '../../shared/types';
import { api, download } from '../lib/api';
import { ago, continentName, countryName, flag, languageName, num, pctChange } from '../lib/format';
import { useAsync, useInterval, useLocalStorage } from '../lib/hooks';
import { AreaChart, BarList } from './Charts';
import { Button, Card, IconButton, Skeleton, Tabs, cx } from './ui';

export const RANGES = [
  { value: '24h', label: '24h', ms: 86_400_000 },
  { value: '7d', label: '7 days', ms: 7 * 86_400_000 },
  { value: '30d', label: '30 days', ms: 30 * 86_400_000 },
  { value: '90d', label: '90 days', ms: 90 * 86_400_000 },
  { value: '12m', label: '12 months', ms: 365 * 86_400_000 },
] as const;
type RangeKey = (typeof RANGES)[number]['value'];

function Stat({ label, value, prev, icon, hint }: { label: string; value: number | null; prev?: number; icon: ReactNode; hint?: string }) {
  const change = value !== null && prev !== undefined ? pctChange(value, prev) : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{label}</span>
        <span className="text-muted/70">{icon}</span>
      </div>
      {value === null ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="mt-2 text-[28px] font-semibold tracking-tight tabular leading-none">{num(value)}</p>}
      <div className="mt-2 h-4 text-xs">
        {change !== null && prev !== undefined ? (
          <span className={cx('inline-flex items-center gap-0.5 font-medium', change >= 0 ? 'text-good-fg' : 'text-bad-fg')}>
            {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(change).toFixed(change !== 0 && Math.abs(change) < 10 ? 1 : 0)}%
            <span className="ml-1 font-normal text-muted">vs previous</span>
          </span>
        ) : (
          <span className="text-muted">{hint}</span>
        )}
      </div>
    </div>
  );
}

const GROUPS: { title: string; tabs: { value: Dimension; label: string }[] }[] = [
  { title: 'Sources', tabs: [{ value: 'link', label: 'Links' }, { value: 'referrer', label: 'Referrers' }, { value: 'source', label: 'Link vs QR' }] },
  { title: 'Locations', tabs: [{ value: 'country', label: 'Countries' }, { value: 'city', label: 'Cities' }, { value: 'region', label: 'Regions' }, { value: 'continent', label: 'Continents' }] },
  { title: 'Technology', tabs: [{ value: 'device', label: 'Devices' }, { value: 'browser', label: 'Browsers' }, { value: 'os', label: 'OS' }, { value: 'language', label: 'Languages' }] },
];

function label(dim: Dimension, row: { key: string; label?: string }): ReactNode {
  switch (dim) {
    case 'country':
      return (
        <span className="flex items-center gap-2">
          <span>{flag(row.key)}</span>
          {countryName(row.key)}
        </span>
      );
    case 'city':
    case 'region': {
      const [place, cc] = row.key.split(', ');
      return (
        <span className="flex items-center gap-2">
          <span>{flag(cc)}</span>
          {place || 'Unknown'}
        </span>
      );
    }
    case 'continent':
      return continentName(row.key);
    case 'language':
      return languageName(row.key);
    case 'link':
      return <span className="font-mono text-[13px]">/{row.label ?? '(deleted)'}</span>;
    case 'referrer':
      return row.key || 'Direct / none';
    case 'source':
      return row.key === 'qr' ? 'QR code scans' : 'Link clicks';
    case 'device':
      return row.key ? row.key.charAt(0).toUpperCase() + row.key.slice(1) : 'Unknown';
    default:
      return row.key || 'Unknown';
  }
}

function BreakdownCard({ group, query, linkMode }: { group: (typeof GROUPS)[number]; query: Record<string, string | number | null>; linkMode: boolean }) {
  const tabs = linkMode ? group.tabs.filter((t) => t.value !== 'link') : group.tabs;
  const [dim, setDim] = useState<Dimension>(tabs[0].value);
  const [, navigate] = useLocation();
  const { data, loading } = useAsync(
    (signal) => api<{ items: BreakdownRow[] }>('/analytics/breakdown', { query: { ...query, dimension: dim, limit: 8 }, signal }),
    [JSON.stringify(query), dim],
  );
  return (
    <Card title={group.title} padded={false} className="flex flex-col">
      <div className="px-5 pt-2">
        <Tabs value={dim} onChange={setDim} items={tabs} />
      </div>
      <div className="min-h-64 p-3">
        {loading && !data ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : (
          <BarList rows={data?.items ?? []} renderLabel={(r) => label(dim, r)} onSelect={dim === 'link' ? (id) => navigate(`/links/${id}`) : undefined} />
        )}
      </div>
    </Card>
  );
}

function LiveFeed({ link }: { link?: string }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const lastId = useRef(0);
  const poll = useCallback(async () => {
    const { items } = await api<{ items: LiveEvent[] }>('/analytics/live', { query: { since: lastId.current, link, limit: 20 } });
    if (items.length) {
      lastId.current = items[0].id;
      setEvents((prev) => [...items, ...prev].slice(0, 20));
    }
    setLoaded(true);
  }, [link]);
  useEffect(() => {
    lastId.current = 0;
    setEvents([]);
    setLoaded(false);
    poll().catch(() => setLoaded(true));
  }, [poll]);
  useInterval(() => void poll().catch(() => {}), 10_000);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="animate-pulse-dot absolute inset-0 rounded-full bg-good" />
          </span>
          Live
        </span>
      }
      description="Latest clicks, refreshed every 10 seconds"
      padded={false}
    >
      <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
        {!loaded &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="px-5 py-3">
              <Skeleton className="h-5" />
            </li>
          ))}
        {loaded && !events.length && (
          <li className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-muted">
            <Radio className="size-5" />
            Waiting for the next click…
          </li>
        )}
        {events.map((e) => (
          <li key={e.id} className="animate-fade-in flex items-center gap-3 px-5 py-2.5 text-sm">
            <span className="text-lg leading-none" title={countryName(e.country)}>
              {flag(e.country)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate">
                <span className="font-mono text-[13px]">/{e.slug ?? '?'}</span>
                {e.source === 'qr' && <QrCode className="ml-1.5 inline size-3.5 text-brand-fg" aria-label="QR scan" />}
              </p>
              <p className="truncate text-xs text-muted">
                {[e.city, e.browser, e.os, e.referrer && `via ${e.referrer}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted">{ago(e.ts)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AnalyticsPanel({ link, headerExtra }: { link?: string; headerExtra?: ReactNode }) {
  const [range, setRange] = useLocalStorage<RangeKey>('hpl-range', '7d');
  const [nonce, setNonce] = useState(0);
  const query = useMemo(() => {
    const ms = RANGES.find((r) => r.value === range)?.ms ?? RANGES[1].ms;
    const to = Date.now();
    return { from: to - ms, to, link: link ?? null, tz: -new Date().getTimezoneOffset() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, link, nonce]);

  const sum = useAsync((signal) => api<Summary>('/analytics/summary', { query, signal }), [query]);
  const series = useAsync((signal) => api<{ interval: 'hour' | 'day'; points: SeriesPoint[] }>('/analytics/timeseries', { query, signal }), [query]);
  const s = sum.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={range} onChange={setRange} items={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
        <div className="flex items-center gap-2">
          {headerExtra}
          <IconButton label="Refresh" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="size-4" />
          </IconButton>
          <Button size="sm" icon={<Download className="size-4" />} onClick={() => download('/analytics/export', query)}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className={cx('grid gap-3 sm:gap-4', link ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4')}>
        <Stat label="Clicks" value={s?.clicks ?? null} prev={s?.previous.clicks} icon={<MousePointerClick className="size-4" />} />
        <Stat label="Unique visitors" value={s?.visitors ?? null} prev={s?.previous.visitors} icon={<Users className="size-4" />} />
        <Stat label="QR scans" value={s?.qr ?? null} icon={<QrCode className="size-4" />} hint={s && s.clicks ? `${Math.round((s.qr / s.clicks) * 100)}% of clicks` : 'Scans of your QR codes'} />
        {!link && <Stat label="Active links" value={s?.active_links ?? null} icon={<Link2 className="size-4" />} hint={s ? `${num(s.links)} links in total` : undefined} />}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card
          className="min-w-0 xl:col-span-2"
          title="Clicks over time"
          actions={
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-[var(--chart-1)]" /> Clicks
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded border-t border-dashed border-[var(--chart-2)]" /> Visitors
              </span>
            </div>
          }
        >
          {series.data ? <AreaChart points={series.data.points} interval={series.data.interval} /> : <Skeleton className="h-60" />}
        </Card>
        <LiveFeed link={link} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((g) => (
          <BreakdownCard key={g.title} group={g} query={query} linkMode={!!link} />
        ))}
      </div>
      {s && s.clicks === 0 && !link && (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-muted">
          <Globe className="size-4" /> No clicks in this period. Share a link and come back to watch the numbers grow.
        </p>
      )}
    </div>
  );
}
