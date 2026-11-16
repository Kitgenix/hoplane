/**
 * Kitgenix attribution: REQUIRED by the licence (LICENSE §2).
 * Keep these links visible and working in every fork. Restyle freely.
 */
import { KITGENIX } from '../../shared/attribution';
import { cx } from './ui';

export function Attribution({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <footer data-kitgenix-attribution className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted', className)}>
      {!compact && (
        <span>
          <a className="font-medium text-text hover:text-brand-fg" href={KITGENIX.repository} target="_blank" rel="noopener">
            {KITGENIX.product}
          </a>{' '}
          by Kitgenix
        </span>
      )}
      {!compact && <span aria-hidden="true">·</span>}
      <a className="underline underline-offset-3 hover:text-brand-fg" href={KITGENIX.website} target="_blank" rel="noopener">
        Kitgenix.com
      </a>
      <span aria-hidden="true">·</span>
      <a className="underline underline-offset-3 hover:text-brand-fg" href={KITGENIX.github} target="_blank" rel="noopener">
        GitHub
      </a>
    </footer>
  );
}

export function Logo({ name, className, byline = true }: { name?: string; className?: string; byline?: boolean }) {
  return (
    <span className={cx('flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <span className="grid size-8 place-items-center rounded-[10px] kg-gradient-primary text-white shadow-sm shadow-brand/30">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate">{name ?? KITGENIX.product}</span>
        {byline && <span className="text-[11px] font-medium text-muted">by Kitgenix</span>}
      </span>
    </span>
  );
}

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
