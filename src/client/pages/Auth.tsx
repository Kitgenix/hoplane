import { ArrowRight, KeyRound } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { InstanceInfo } from '../../shared/types';
import { KITGENIX } from '../../shared/attribution';
import { Attribution, GithubMark, Logo } from '../components/Attribution';
import { Button, Field, Input } from '../components/ui';
import { api, ApiError } from '../lib/api';

function Shell({ instance, children }: { instance: InstanceInfo | null; children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Logo name={instance?.site_name} />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <Attribution />
      </div>
      <aside className="relative hidden overflow-hidden kg-gradient-midnight p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="kg-gradient-nebula absolute -right-40 -top-40 size-[34rem] rounded-full opacity-60 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-[#42b3ff]/25 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-medium text-white/70">Self-hosted · Open to fork · Cloudflare-native</p>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">Short links, real insight, zero servers.</h2>
          <ul className="mt-8 space-y-3 text-white/85">
            {['Redirects from 300+ cities worldwide', 'Privacy-first analytics: no IPs stored', 'QR codes, A/B splits, geo & device targeting', 'Your data stays in your Cloudflare account'].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="grid size-5 place-items-center rounded-full bg-white/15 text-xs">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <a href={KITGENIX.repository} target="_blank" rel="noopener" className="relative inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-white/20">
          <GithubMark className="size-4" /> Hoplane by Kitgenix: deploy your own
        </a>
      </aside>
    </div>
  );
}

export function LoginPage({ instance, onDone }: { instance: InstanceInfo | null; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { body: { email, password } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell instance={instance}>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to manage your links.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad-fg">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Sign in <ArrowRight className="size-4" />
        </Button>
      </form>
      <p className="mt-6 text-xs text-muted">Forgot your password? Ask an admin on this instance to reset it.</p>
    </Shell>
  );
}

export function SetupPage({ instance, onDone }: { instance: InstanceInfo; onDone: () => void }) {
  const [form, setForm] = useState({ token: '', name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/setup', { body: form });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Shell instance={instance}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-fg">
        <KeyRound className="size-3.5" /> First-time setup
      </span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Create your owner account</h1>
      <p className="mt-1 text-sm text-muted">This happens once. You can invite teammates afterwards.</p>
      {!instance.setup_enabled ? (
        <div className="mt-8 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          <p className="font-medium">Set a setup token to continue</p>
          <p className="mt-1 text-muted">
            Add a secret called <code className="font-mono text-text">SETUP_TOKEN</code> (at least 8 characters) in Cloudflare → Workers → your Worker → Settings → Variables and Secrets, or run{' '}
            <code className="font-mono text-text">npx wrangler secret put SETUP_TOKEN</code>. Then reload this page.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Setup token" htmlFor="token" hint="The SETUP_TOKEN secret you set when deploying.">
            <Input id="token" type="password" required value={form.token} onChange={set('token')} autoFocus autoComplete="off" />
          </Field>
          <Field label="Your name" htmlFor="name">
            <Input id="name" value={form.name} onChange={set('name')} autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="semail">
            <Input id="semail" type="email" required value={form.email} onChange={set('email')} autoComplete="username" />
          </Field>
          <Field label="Password" htmlFor="spw" hint="At least 10 characters.">
            <Input id="spw" type="password" required minLength={10} value={form.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad-fg">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            Create account <ArrowRight className="size-4" />
          </Button>
        </form>
      )}
    </Shell>
  );
}
