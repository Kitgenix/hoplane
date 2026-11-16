import { KeyRound, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { ApiKey, Role, Scope, User } from '../../shared/types';
import { ROLES, SCOPES } from '../../shared/types';
import { KITGENIX } from '../../shared/attribution';
import { GithubMark } from '../components/Attribution';
import { PageHeader } from '../components/Layout';
import { Badge, Button, Card, CopyButton, Empty, Field, IconButton, Input, Modal, Select, Skeleton, Switch, Tabs, Textarea, useConfirm, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ago, dateTime } from '../lib/format';
import { useAsync, useSession } from '../lib/hooks';

type Tab = 'account' | 'team' | 'keys' | 'security' | 'audit' | 'about';

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including managing admins',
  admin: 'Manage links, team members and settings',
  editor: 'Create and edit links, view analytics',
  viewer: 'Read-only access to links and analytics',
};

function AccountTab() {
  const { me } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password', { body: form });
      setForm({ current: '', next: '' });
      toast('Password changed. Other devices have been signed out.', 'good');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card title="Profile">
        <dl className="space-y-3 text-sm">
          <div><dt className="text-xs text-muted">Name</dt><dd className="font-medium">{me.name || '—'}</dd></div>
          <div><dt className="text-xs text-muted">Email</dt><dd className="font-medium">{me.email}</dd></div>
          <div><dt className="text-xs text-muted">Role</dt><dd><Badge tone="brand" className="capitalize">{me.role}</Badge> <span className="ml-1 text-muted">{ROLE_HELP[me.role]}</span></dd></div>
        </dl>
      </Card>
      <Card title="Change password">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Current password"><Input type="password" autoComplete="current-password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></Field>
          <Field label="New password" hint="At least 10 characters."><Input type="password" autoComplete="new-password" minLength={10} required value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></Field>
          {error && <p className="text-sm text-bad-fg">{error}</p>}
          <Button type="submit" variant="primary" loading={busy}>Update password</Button>
        </form>
      </Card>
    </div>
  );
}

function TeamTab() {
  const { me } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useAsync((signal) => api<{ items: User[] }>('/users', { signal }), []);
  const [invite, setInvite] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'editor' as Role, password: '' });
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState<User | null>(null);
  const [resetPw, setResetPw] = useState('');
  const assignable = me.role === 'owner' ? ROLES : ROLES.filter((r) => r === 'editor' || r === 'viewer');

  const add = async () => {
    setError(null);
    try {
      await api('/users', { body: form });
      toast('Team member added. Share their password with them securely.', 'good');
      setInvite(false);
      setForm({ email: '', name: '', role: 'editor', password: '' });
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed');
    }
  };
  const generate = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');

  return (
    <Card
      title="Team"
      description="Everyone who can sign in to this dashboard."
      padded={false}
      actions={<Button size="sm" variant="primary" icon={<UserPlus className="size-4" />} onClick={() => { setForm((f) => ({ ...f, password: generate() })); setInvite(true); }}>Add member</Button>}
    >
      {!data ? <div className="p-5"><Skeleton className="h-24" /></div> : (
        <ul className="divide-y divide-line">
          {data.items.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="grid size-9 place-items-center rounded-full bg-brand-soft font-semibold uppercase text-brand-fg">{(u.name || u.email).charAt(0)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.name || u.email} {u.id === me.id && <span className="text-xs text-muted">(you)</span>}</p>
                <p className="truncate text-xs text-muted">{u.email} · last sign-in {ago(u.last_login_at)}</p>
              </div>
              <Select
                className="h-8 w-28 text-[13px] capitalize"
                value={u.role}
                disabled={u.id === me.id || (me.role !== 'owner' && (u.role === 'owner' || u.role === 'admin'))}
                onChange={async (e) => {
                  try {
                    await api(`/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } });
                    toast('Role updated', 'good');
                    reload();
                  } catch (err) {
                    toast(err instanceof ApiError ? err.message : 'Failed', 'bad');
                  }
                }}
              >
                {ROLES.map((r) => <option key={r} value={r} disabled={!assignable.includes(r)}>{r}</option>)}
              </Select>
              <Button size="sm" variant="ghost" onClick={() => { setReset(u); setResetPw(generate()); }} disabled={u.id === me.id}>Reset password</Button>
              <IconButton
                label="Remove"
                disabled={u.id === me.id}
                onClick={async () => {
                  if (!(await confirm({ title: `Remove ${u.email}?`, message: 'They will be signed out immediately and their API keys revoked. Their links stay.', confirm: 'Remove', danger: true }))) return;
                  try {
                    await api(`/users/${u.id}`, { method: 'DELETE' });
                    reload();
                  } catch (err) {
                    toast(err instanceof ApiError ? err.message : 'Failed', 'bad');
                  }
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Modal open={invite} onClose={() => setInvite(false)} title="Add team member" footer={<><Button onClick={() => setInvite(false)}>Cancel</Button><Button variant="primary" onClick={add}>Add member</Button></>}>
        <div className="space-y-3">
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus /></Field>
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Role" hint={ROLE_HELP[form.role]}>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="capitalize">
              {assignable.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Temporary password" hint="Share it securely. They can change it under Settings → Account.">
            <div className="flex gap-2"><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="font-mono" /><CopyButton text={form.password} /></div>
          </Field>
          {error && <p className="text-sm text-bad-fg">{error}</p>}
        </div>
      </Modal>
      <Modal
        open={!!reset}
        onClose={() => setReset(null)}
        title={`Reset password for ${reset?.email}`}
        footer={<><Button onClick={() => setReset(null)}>Cancel</Button><Button variant="primary" onClick={async () => {
          try {
            await api(`/users/${reset!.id}`, { method: 'PATCH', body: { password: resetPw } });
            toast('Password reset. They have been signed out everywhere.', 'good');
            setReset(null);
          } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed', 'bad'); }
        }}>Reset password</Button></>}
      >
        <Field label="New password"><div className="flex gap-2"><Input value={resetPw} onChange={(e) => setResetPw(e.target.value)} className="font-mono" /><CopyButton text={resetPw} /></div></Field>
      </Modal>
    </Card>
  );
}

function KeysTab() {
  const { me } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useAsync((signal) => api<{ items: ApiKey[] }>('/keys', { signal }), []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(me.scopes);
  const [expires, setExpires] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const origin = window.location.origin;

  const create = async () => {
    try {
      const r = await api<{ key: string }>('/keys', { body: { name, scopes, expires_in_days: expires ? Number(expires) : null } });
      setCreated(r.key);
      setName('');
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed', 'bad');
    }
  };

  return (
    <div className="space-y-5">
      <Card title="API keys" description="Use keys for the REST API, scripts, Zapier/Make, and AI assistants via MCP." padded={false} actions={<Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => { setCreated(null); setOpen(true); }}>New key</Button>}>
        {!data ? <div className="p-5"><Skeleton className="h-16" /></div> : !data.items.length ? (
          <Empty icon={<KeyRound className="size-5" />} title="No API keys yet">Create a key to automate link creation or connect an AI assistant.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{k.name}</p>
                  <p className="text-xs text-muted"><code className="font-mono">{k.prefix}…</code> · created {ago(k.created_at)} · {k.last_used_at ? `used ${ago(k.last_used_at)}` : 'never used'}{k.expires_at ? ` · expires ${dateTime(k.expires_at)}` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                <IconButton label="Revoke" onClick={async () => {
                  if (!(await confirm({ title: `Revoke “${k.name}”?`, message: 'Anything using this key will stop working immediately.', confirm: 'Revoke', danger: true }))) return;
                  await api(`/keys/${k.id}`, { method: 'DELETE' });
                  reload();
                }}><Trash2 className="size-4" /></IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Connect an AI assistant (MCP)" description="Let Claude, Cursor or any MCP client create links and read analytics for you.">
        <p className="mb-2 text-sm text-muted">Server URL</p>
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px]"><span className="flex-1 truncate">{origin}/api/mcp</span><CopyButton text={`${origin}/api/mcp`} /></div>
        <p className="mb-2 text-sm text-muted">Example client configuration</p>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed">{`{
  "mcpServers": {
    "hoplane": {
      "type": "http",
      "url": "${origin}/api/mcp",
      "headers": { "Authorization": "Bearer hpl_your_key" }
    }
  }
}`}</pre>
        <p className="mb-2 mt-4 text-sm text-muted">Or call the REST API directly</p>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed">{`curl -X POST ${origin}/api/links \\
  -H "Authorization: Bearer hpl_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","slug":"hello"}'`}</pre>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={created ? 'Copy your new key' : 'New API key'} footer={created ? <Button variant="primary" onClick={() => setOpen(false)}>Done</Button> : <><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!name || !scopes.length} onClick={create}>Create key</Button></>}>
        {created ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">This is the only time the key is shown. Store it somewhere safe.</p>
            <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px]"><span className="flex-1 break-all">{created}</span><CopyButton text={created} /></div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zapier, CI, Claude…" autoFocus /></Field>
            <Field label="Permissions">
              <div className="space-y-2">
                {SCOPES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-[var(--brand)]" disabled={!me.scopes.includes(s)} checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />
                    <code className="font-mono">{s}</code>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Expires">
              <Select value={expires} onChange={(e) => setExpires(e.target.value)}>
                <option value="">Never</option>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
                <option value="365">In 1 year</option>
              </Select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SecurityTab() {
  const toast = useToast();
  const { data, setData } = useAsync((signal) => api<{ blocked_domains: string[]; warn_all: boolean; track_bots: boolean }>('/settings', { signal }), []);
  const [domains, setDomains] = useState('');
  useEffect(() => { if (data) setDomains(data.blocked_domains.join('\n')); }, [data]);
  if (!data) return <Skeleton className="h-40" />;
  const save = async (patch: Partial<typeof data>) => {
    try {
      setData(await api('/settings', { method: 'PUT', body: patch }));
      toast('Settings saved', 'good');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed', 'bad');
    }
  };
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card title="Redirect safety">
        <div className="space-y-5">
          <Switch checked={data.warn_all} onChange={(v) => save({ warn_all: v })} label="Warning page for every link" description="Visitors see the destination and must click to continue. Useful for public or community shorteners." />
          <Switch checked={data.track_bots} onChange={(v) => save({ track_bots: v })} label="Count bots and crawlers" description="Off by default so analytics reflect real people." />
        </div>
      </Card>
      <Card title="Blocked domains" description="Nobody can create links to these domains or their subdomains.">
        <Textarea rows={7} value={domains} onChange={(e) => setDomains(e.target.value)} placeholder={'example-phishing.com\nbad.example'} className="font-mono text-[13px]" />
        <Button className="mt-3" variant="primary" onClick={() => save({ blocked_domains: domains.split(/[\s,]+/).map((d) => d.trim().toLowerCase()).filter(Boolean) })}>Save blocklist</Button>
      </Card>
    </div>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const { data } = useAsync((signal) => api<{ items: { id: number; ts: number; actor: string; action: string; target: string; detail: string }[] }>('/audit', { query: { page }, signal }), [page]);
  return (
    <Card title="Audit log" description="Who changed what, kept for two years." padded={false}>
      {!data ? <div className="p-5"><Skeleton className="h-40" /></div> : (
        <>
          <ul className="divide-y divide-line text-sm">
            {data.items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5">
                <Badge>{e.action}</Badge>
                <span className="min-w-0 flex-1 truncate">{e.target}</span>
                <span className="text-xs text-muted">{e.actor} · {dateTime(e.ts)}</span>
              </li>
            ))}
            {!data.items.length && <li className="px-5 py-10 text-center text-muted">Nothing here yet.</li>}
          </ul>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
            <Button size="sm" disabled={data.items.length < 50} onClick={() => setPage(page + 1)}>Older</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function AboutTab() {
  const { instance } = useSession();
  const rows: [string, string][] = [
    ['Version', instance.version],
    ['Slug length', `${instance.slug_length} characters`],
    ['Case-sensitive slugs', instance.case_sensitive ? 'Yes' : 'No'],
    ['Analytics retention', `${instance.retention_days} days`],
    ['Edge cache (KV)', instance.cache ? 'Enabled' : 'Not configured'],
    ['Nightly backups (R2)', instance.backups ? 'Enabled' : 'Not configured'],
  ];
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card title="This instance">
        <dl className="divide-y divide-line text-sm">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
        </dl>
        <p className="mt-3 text-xs text-muted">Change these with the <code className="font-mono">vars</code> in <code className="font-mono">wrangler.jsonc</code> and redeploy.</p>
      </Card>
      <Card title={<span className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-fg" /> Made by Kitgenix</span>}>
        <p className="text-sm text-muted">
          {KITGENIX.product} is free, self-hosted URL-shortening software by Kitgenix. Fork it, deploy it to your own Cloudflare account and make it yours. The licence asks for one thing in return: keep the visible credit links to Kitgenix.com and the Kitgenix GitHub.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={KITGENIX.website} target="_blank" rel="noopener"><Button>Kitgenix.com</Button></a>
          <a href={KITGENIX.github} target="_blank" rel="noopener"><Button icon={<GithubMark className="size-4" />}>Kitgenix on GitHub</Button></a>
        </div>
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const { isAdmin } = useSession();
  const [tab, setTab] = useState<Tab>('account');
  const tabs: { value: Tab; label: string }[] = [
    { value: 'account', label: 'Account' },
    ...(isAdmin ? [{ value: 'team' as Tab, label: 'Team' }] : []),
    { value: 'keys', label: 'API & MCP' },
    ...(isAdmin ? [{ value: 'security' as Tab, label: 'Security' }, { value: 'audit' as Tab, label: 'Audit log' }] : []),
    { value: 'about', label: 'About' },
  ];
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onChange={setTab} items={tabs} className="mb-5 w-fit max-w-full" />
      {tab === 'account' && <AccountTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'keys' && <KeysTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'about' && <AboutTab />}
    </>
  );
}
