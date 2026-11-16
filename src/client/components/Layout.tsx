import { BarChart3, Link2, LogOut, Menu, Monitor, Moon, Settings, Sun, Upload, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { KITGENIX } from '../../shared/attribution';
import { api } from '../lib/api';
import { useLocalStorage, useSession } from '../lib/hooks';
import { Attribution, GithubMark, Logo } from './Attribution';
import { IconButton, cx } from './ui';

const NAV = [
  { href: '/', label: 'Analytics', icon: BarChart3 },
  { href: '/links', label: 'Links', icon: Link2 },
  { href: '/import', label: 'Import & export', icon: Upload },
  { href: '/settings', label: 'Settings', icon: Settings },
];

type Theme = 'system' | 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>('hpl-theme', 'system');
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('dark', theme === 'dark');
    el.classList.toggle('light', theme === 'light');
  }, [theme]);
  return [theme, setTheme] as const;
}

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <IconButton label={`Theme: ${theme}`} onClick={() => setTheme(next[theme])}>
      <Icon className="size-4" />
    </IconButton>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { me, instance } = useSession();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location]);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/dashboard/login';
  };

  const active = (href: string) => (href === '/' ? location === '/' : location.startsWith(href));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link href="/">
          <Logo name={instance.site_name} />
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Main">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              active(n.href) ? 'bg-brand-soft text-brand-fg' : 'text-muted hover:bg-surface-2 hover:text-text',
            )}
          >
            <n.icon className="size-[18px]" />
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="m-3 rounded-xl border border-line bg-surface-2/60 p-3">
        <p className="text-xs text-muted leading-relaxed">
          Self-hosted on your Cloudflare account. Free and open to fork.
        </p>
        <a
          href={KITGENIX.repository}
          target="_blank"
          rel="noopener"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-text hover:text-brand-fg"
        >
          <GithubMark className="size-3.5" /> Star on GitHub
        </a>
      </div>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-fg uppercase">
            {(me.name || me.email).charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me.name || me.email.split('@')[0]}</p>
            <p className="truncate text-xs text-muted capitalize">{me.role}</p>
          </div>
          <ThemeToggle />
          <IconButton label="Sign out" onClick={logout}>
            <LogOut className="size-4" />
          </IconButton>
        </div>
        <Attribution compact className="px-2 pt-2" />
      </div>
    </div>
  );

  return (
    <div className="min-h-full lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="animate-fade-in absolute inset-y-0 left-0 w-72 border-r border-line bg-surface">
            <div className="absolute right-3 top-4">
              <IconButton label="Close menu" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </IconButton>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur lg:hidden">
        <IconButton label="Open menu" onClick={() => setOpen(true)}>
          <Menu className="size-5" />
        </IconButton>
        <Logo name={instance.site_name} className="text-sm" />
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      <Attribution className="mx-auto max-w-7xl justify-center px-4 pb-8 sm:px-6 lg:px-8" />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
