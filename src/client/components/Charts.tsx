import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SeriesPoint } from '../../shared/types';
import { num, short } from '../lib/format';
import { cx } from './ui';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export function AreaChart({ points, interval, height = 240 }: { points: SeriesPoint[]; interval: 'hour' | 'day'; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...points.map((p) => p.clicks)));
  const x = (i: number) => pad.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const { area, line, vline } = useMemo(() => {
    if (!points.length) return { area: '', line: '', vline: '' };
    const l = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.clicks).toFixed(1)}`).join('');
    const v = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.visitors).toFixed(1)}`).join('');
    return { line: l, vline: v, area: `${l}L${x(points.length - 1).toFixed(1)},${pad.t + ih}L${x(0).toFixed(1)},${pad.t + ih}Z` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width, height, max]);

  const fmt = (t: number) =>
    interval === 'hour'
      ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric' })
      : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const tickEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 80))));
  const h = hover !== null ? points[hover] : null;

  return (
    <div ref={ref} className="relative w-full min-w-0 select-none" style={{ height }}>
      <svg
        className="absolute left-0 top-0"
        width={width}
        height={height}
        role="img"
        aria-label="Clicks over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
          const rel = e.clientX - rect.left - pad.l;
          const i = Math.round((rel / iw) * (points.length - 1));
          setHover(i >= 0 && i < points.length ? i : null);
        }}
      >
        <defs>
          <linearGradient id="kg-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={width - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--chart-grid)" strokeDasharray={f ? '3 4' : undefined} />
            <text x={pad.l - 8} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tabular">
              {short(max * f)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % tickEvery === 0 ? (
            <text key={p.t} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i >= points.length - tickEvery ? 'end' : 'middle'} fontSize="11" fill="var(--muted)">
              {fmt(p.t)}
            </text>
          ) : null,
        )}
        <path d={area} fill="url(#kg-area)" />
        <path d={vline} fill="none" stroke="var(--chart-2)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.8" />
        <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" />
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--line)" />
            <circle cx={x(hover)} cy={y(h.clicks)} r="4" fill="var(--surface)" stroke="var(--chart-1)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(hover) - 70, 0), width - 150), width: 140 }}
        >
          <p className="font-medium">
            {interval === 'hour' ? new Date(h.t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : new Date(h.t).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </p>
          <p className="mt-1 flex justify-between">
            <span className="text-muted">Clicks</span>
            <span className="tabular font-medium">{num(h.clicks)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted">Visitors</span>
            <span className="tabular font-medium">{num(h.visitors)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export function BarList({ rows, renderLabel, total, onSelect, empty = 'No data yet' }: {
  rows: { key: string; clicks: number; visitors?: number; label?: string }[];
  renderLabel?: (row: { key: string; label?: string }) => ReactNode;
  total?: number;
  onSelect?: (key: string) => void;
  empty?: string;
}) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.clicks), 1);
  const sum = total ?? rows.reduce((s, r) => s + r.clicks, 0);
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.key || '∅'}>
          <button
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(r.key)}
            className={cx('group relative flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm', onSelect && 'cursor-pointer hover:bg-surface-2')}
          >
            <span className="absolute inset-y-0.5 left-0 rounded-md bg-brand/10 transition-all" style={{ width: `${(r.clicks / max) * 100}%` }} />
            <span className="relative min-w-0 flex-1 truncate">{renderLabel ? renderLabel(r) : r.label || r.key || 'Unknown'}</span>
            <span className="relative tabular text-muted text-xs w-10 text-right">{sum ? Math.round((r.clicks / sum) * 100) : 0}%</span>
            <span className="relative tabular font-medium w-14 text-right">{short(r.clicks)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, values.length - 1)) * 100},${30 - (v / max) * 28}`).join('');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cx('h-8 w-24', className)} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
