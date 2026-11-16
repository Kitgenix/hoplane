import { Dices, Image as ImageIcon, Loader2, Lock, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Link, RoutingRule, RuleField, Utm, Variant } from '../../shared/types';
import { RULE_FIELDS } from '../../shared/types';
import { api, ApiError } from '../lib/api';
import { fromLocalInput, hostOf, toLocalInput } from '../lib/format';
import { useDebounced, useSession } from '../lib/hooks';
import { Badge, Button, Drawer, Field, IconButton, Input, Select, Switch, Tabs, Textarea, cx, useToast } from './ui';

type Tab = 'basics' | 'preview' | 'routing' | 'protection' | 'utm';

interface Form {
  url: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  notes: string;
  tags: string[];
  redirect_code: Link['redirect_code'];
  forward_query: boolean;
  utm: Utm;
  rules: RoutingRule[];
  variants: Variant[];
  password: string;
  removePassword: boolean;
  warning: boolean;
  starts_at: number | null;
  expires_at: number | null;
  expired_url: string;
  max_clicks: string;
  disabled: boolean;
}

function initial(link?: Link | null): Form {
  return {
    url: link?.url ?? '',
    slug: link?.slug ?? '',
    title: link?.title ?? '',
    description: link?.description ?? '',
    image: link?.image ?? '',
    notes: link?.notes ?? '',
    tags: link?.tags ?? [],
    redirect_code: link?.redirect_code ?? 302,
    forward_query: link?.forward_query ?? true,
    utm: link?.utm ?? {},
    rules: link?.rules ?? [],
    variants: link?.variants ?? [],
    password: '',
    removePassword: false,
    warning: link?.warning ?? false,
    starts_at: link?.starts_at ?? null,
    expires_at: link?.expires_at ?? null,
    expired_url: link?.expired_url ?? '',
    max_clicks: link?.max_clicks ? String(link.max_clicks) : '',
    disabled: link?.disabled ?? false,
  };
}

const FIELD_LABELS: Record<RuleField, { label: string; placeholder: string }> = {
  country: { label: 'Country', placeholder: 'GB, US, DE' },
  continent: { label: 'Continent', placeholder: 'EU, NA, AS' },
  device: { label: 'Device', placeholder: 'mobile, tablet, desktop' },
  os: { label: 'Operating system', placeholder: 'iOS, Android, Windows, macOS' },
  browser: { label: 'Browser', placeholder: 'Chrome, Safari, Firefox' },
  language: { label: 'Language', placeholder: 'en, fr, de' },
  referrer: { label: 'Referrer domain', placeholder: 'twitter.com, linkedin.com' },
};

export function TagInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const add = (t: string) => {
    const tag = t.trim().replace(/,$/, '');
    if (tag && !value.includes(tag) && value.length < 20) onChange([...value, tag.slice(0, 40)]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
  };
  const listId = useMemo(() => `tags-${Math.random().toString(36).slice(2)}`, []);
  return (
    <div className="flex min-h-9.5 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
      {value.map((t) => (
        <Badge key={t} tone="brand" className="py-1">
          {t}
          <button type="button" aria-label={`Remove ${t}`} className="cursor-pointer opacity-70 hover:opacity-100" onClick={() => onChange(value.filter((x) => x !== t))}>
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        list={listId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => text && add(text)}
        placeholder={value.length ? '' : 'Add tags…'}
        className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted/70"
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

function randomSlug(n: number) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => a[b % a.length]).join('');
}

export function LinkEditor({ open, onClose, link, onSaved }: { open: boolean; onClose: () => void; link?: Link | null; onSaved: (l: Link) => void }) {
  const { instance } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('basics');
  const [f, setF] = useState<Form>(() => initial(link));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [tags, setTags] = useState<string[]>([]);
  const fetchedFor = useRef('');
  const editing = !!link;

  useEffect(() => {
    if (open) {
      setF(initial(link));
      setTab('basics');
      setError(null);
      setSlugState('idle');
      fetchedFor.current = link?.url ?? '';
      api<{ items: { tag: string }[] }>('/tags').then((r) => setTags(r.items.map((t) => t.tag))).catch(() => {});
    }
  }, [open, link]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // Live slug availability
  const debouncedSlug = useDebounced(f.slug, 350);
  useEffect(() => {
    if (!open || !debouncedSlug || (editing && debouncedSlug === link?.slug)) return setSlugState('idle');
    setSlugState('checking');
    api<{ available: boolean; reason: string | null }>('/links/check', { query: { slug: debouncedSlug } })
      .then((r) => setSlugState(r.available ? 'ok' : r.reason === 'invalid' ? 'invalid' : 'taken'))
      .catch(() => setSlugState('idle'));
  }, [debouncedSlug, open, editing, link?.slug]);

  const fetchMeta = async (force = false) => {
    if (!/^https?:\/\/.+\..+/.test(f.url) || (!force && fetchedFor.current === f.url)) return;
    fetchedFor.current = f.url;
    setFetching(true);
    try {
      const m = await api<{ title: string; description: string; image: string; suggested_slug: string | null }>('/meta', { query: { url: f.url } });
      setF((p) => ({
        ...p,
        title: force || !p.title ? m.title || p.title : p.title,
        description: force || !p.description ? m.description || p.description : p.description,
        image: force || !p.image ? m.image || p.image : p.image,
        slug: !editing && !p.slug && m.suggested_slug && m.suggested_slug.length <= 40 ? m.suggested_slug : p.slug,
      }));
      if (force) toast(m.title ? 'Fetched details from the page' : 'No preview details found on that page');
    } catch {
      // Ignore: metadata is a convenience.
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      url: f.url.trim(),
      title: f.title,
      description: f.description,
      image: f.image.trim(),
      notes: f.notes,
      tags: f.tags,
      redirect_code: f.redirect_code,
      forward_query: f.forward_query,
      utm: f.utm,
      rules: f.rules.map((r) => ({ ...r, values: r.values.filter(Boolean) })),
      variants: f.variants,
      warning: f.warning,
      starts_at: f.starts_at,
      expires_at: f.expires_at,
      expired_url: f.expired_url.trim() || null,
      max_clicks: f.max_clicks ? Number(f.max_clicks) : null,
      disabled: f.disabled,
    };
    if (f.slug.trim()) body.slug = f.slug.trim();
    if (f.password) body.password = f.password;
    else if (f.removePassword) body.password = null;
    try {
      const saved = editing ? await api<Link>(`/links/${link!.id}`, { method: 'PATCH', body }) : await api<Link>('/links', { body });
      toast(editing ? 'Link updated' : 'Link created', 'good');
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the link');
    } finally {
      setSaving(false);
    }
  };

  const origin = window.location.origin;
  const counts = {
    routing: f.rules.length + f.variants.length,
    protection: [f.password || (link?.has_password && !f.removePassword), f.warning, f.starts_at, f.expires_at, f.max_clicks].filter(Boolean).length,
    utm: Object.values(f.utm).filter(Boolean).length,
  };
  const tabLabel = (t: string, n = 0) => (
    <span className="flex items-center gap-1.5">
      {t}
      {n > 0 && <span className="rounded bg-brand px-1 text-[10px] font-semibold leading-4 text-brand-ink">{n}</span>}
    </span>
  );
  const variantTotal = f.variants.reduce((s, v) => s + v.weight, 0);

  let finalUrl = '';
  try {
    const u = new URL(f.url);
    for (const [k, v] of Object.entries(f.utm)) if (v && !u.searchParams.has(`utm_${k}`)) u.searchParams.set(`utm_${k}`, v);
    finalUrl = u.toString();
  } catch {}

  return (
    <Drawer
      open={open}
      onClose={onClose}
      wide
      title={editing ? 'Edit link' : 'Create link'}
      footer={
        <>
          {error && <p className="mr-auto text-sm text-bad-fg">{error}</p>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={!f.url || slugState === 'taken' || slugState === 'invalid'}>
            {editing ? 'Save changes' : 'Create link'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Destination URL" htmlFor="kg-url">
          <div className="relative">
            <Input
              id="kg-url"
              type="url"
              required
              autoFocus={!editing}
              placeholder="https://example.com/a-very-long-page"
              value={f.url}
              onChange={(e) => set('url', e.target.value)}
              onBlur={() => !editing && fetchMeta()}
            />
            {fetching && <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-muted" />}
          </div>
        </Field>

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'basics', label: 'Basics' },
            { value: 'preview', label: 'Social preview' },
            { value: 'routing', label: tabLabel('Routing', counts.routing) },
            { value: 'protection', label: tabLabel('Rules', counts.protection) },
            { value: 'utm', label: tabLabel('UTM', counts.utm) },
          ]}
        />

        {tab === 'basics' && (
          <div className="space-y-4">
            <Field
              label="Short link"
              error={slugState === 'taken' ? 'That slug is already taken' : slugState === 'invalid' ? 'Use letters, numbers, "-", "_" or "/"; reserved words are not allowed' : null}
              hint={slugState === 'ok' ? <span className="text-good-fg">Available</span> : `Leave empty for a random ${instance.slug_length}-character slug.`}
            >
              <div className="flex h-9.5 items-stretch overflow-hidden rounded-lg border border-line focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
                <span className="flex items-center bg-surface-2 px-3 text-sm text-muted whitespace-nowrap">{new URL(origin).host}/</span>
                <input
                  value={f.slug}
                  onChange={(e) => set('slug', e.target.value.replace(/\s+/g, '-'))}
                  placeholder="summer-sale"
                  className="min-w-0 flex-1 bg-surface px-3 text-sm outline-none"
                  aria-label="Slug"
                />
                <button type="button" title="Random slug" onClick={() => set('slug', randomSlug(instance.slug_length))} className="cursor-pointer px-3 text-muted hover:text-text">
                  <Dices className="size-4" />
                </button>
              </div>
            </Field>
            <Field label="Title" hint="Helps you find the link. Also used for social previews.">
              <Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Summer sale landing page" maxLength={200} />
            </Field>
            <Field label="Tags">
              <TagInput value={f.tags} onChange={(v) => set('tags', v)} suggestions={tags} />
            </Field>
            <Field label="Private notes">
              <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={2000} placeholder="Only visible to your team" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Redirect type">
                <Select value={f.redirect_code} onChange={(e) => set('redirect_code', Number(e.target.value) as Link['redirect_code'])}>
                  <option value={302}>302 Temporary (recommended)</option>
                  <option value={307}>307 Temporary, keep method</option>
                  <option value={301}>301 Permanent (cached by browsers)</option>
                  <option value={308}>308 Permanent, keep method</option>
                </Select>
              </Field>
            </div>
            <div className="space-y-4 rounded-xl border border-line p-4">
              <Switch checked={f.forward_query} onChange={(v) => set('forward_query', v)} label="Forward query parameters" description="Pass ?ref=… and other parameters from the short link through to the destination." />
              <Switch checked={!f.disabled} onChange={(v) => set('disabled', !v)} label="Link is live" description="Turn off to stop redirecting without deleting the link." />
            </div>
          </div>
        )}

        {tab === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Customise the card shown when this link is shared on social media, Slack, WhatsApp, iMessage and similar apps.</p>
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="grid aspect-[1.91/1] place-items-center bg-surface-2">
                {f.image ? <img src={f.image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : <ImageIcon className="size-8 text-muted/50" />}
              </div>
              <div className="space-y-0.5 p-3">
                <p className="text-xs uppercase text-muted">{new URL(origin).host}</p>
                <p className="line-clamp-1 font-semibold">{f.title || 'Title'}</p>
                <p className="line-clamp-2 text-sm text-muted">{f.description || 'Description'}</p>
              </div>
            </div>
            <Button size="sm" icon={<Sparkles className="size-4" />} loading={fetching} onClick={() => fetchMeta(true)} disabled={!f.url}>
              Fetch from destination
            </Button>
            <Field label="Title">
              <Input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
            </Field>
            <Field label="Description">
              <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={500} rows={3} />
            </Field>
            <Field label="Image URL" hint="1200 × 630px works best.">
              <Input type="url" value={f.image} onChange={(e) => set('image', e.target.value)} placeholder="https://…/preview.png" />
            </Field>
          </div>
        )}

        {tab === 'routing' && (
          <div className="space-y-6">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Targeting rules</h3>
                <p className="text-xs text-muted">Send visitors to a different URL based on who they are. The first matching rule wins.</p>
              </div>
              {f.rules.map((r, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted">If</span>
                    <Select value={r.field} onChange={(e) => set('rules', f.rules.map((x, j) => (j === i ? { ...x, field: e.target.value as RuleField } : x)))} className="h-8 w-auto text-[13px]">
                      {RULE_FIELDS.map((k) => (
                        <option key={k} value={k}>
                          {FIELD_LABELS[k].label}
                        </option>
                      ))}
                    </Select>
                    <Select value={r.op} onChange={(e) => set('rules', f.rules.map((x, j) => (j === i ? { ...x, op: e.target.value as 'in' | 'not_in' } : x)))} className="h-8 w-auto text-[13px]">
                      <option value="in">is one of</option>
                      <option value="not_in">is not</option>
                    </Select>
                    <IconButton label="Remove rule" className="ml-auto" onClick={() => set('rules', f.rules.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                  <Input
                    value={r.values.join(', ')}
                    placeholder={FIELD_LABELS[r.field].placeholder}
                    onChange={(e) => set('rules', f.rules.map((x, j) => (j === i ? { ...x, values: e.target.value.split(',').map((s) => s.trim()) } : x)))}
                  />
                  <Input type="url" value={r.url} placeholder="then go to https://…" onChange={(e) => set('rules', f.rules.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                </div>
              ))}
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => set('rules', [...f.rules, { field: 'device', op: 'in', values: ['mobile'], url: '' }])}>
                Add rule
              </Button>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">A/B split</h3>
                <p className="text-xs text-muted">Split traffic across destinations by weight. Applies when no targeting rule matches. Leave empty to always use the main destination.</p>
              </div>
              {f.variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="url" value={v.url} placeholder="https://…" onChange={(e) => set('variants', f.variants.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    value={v.weight}
                    onChange={(e) => set('variants', f.variants.map((x, j) => (j === i ? { ...x, weight: Math.max(0, Number(e.target.value) || 0) } : x)))}
                    className="w-20"
                    aria-label="Weight"
                  />
                  <span className="w-11 text-right text-xs tabular text-muted">{variantTotal ? Math.round((v.weight / variantTotal) * 100) : 0}%</span>
                  <IconButton label="Remove" onClick={() => set('variants', f.variants.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              ))}
              <Button
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() => set('variants', f.variants.length ? [...f.variants, { url: '', weight: 50 }] : [{ url: f.url, weight: 50 }, { url: '', weight: 50 }])}
              >
                Add destination
              </Button>
            </section>
          </div>
        )}

        {tab === 'protection' && (
          <div className="space-y-5">
            <Field label={<span className="flex items-center gap-1.5"><Lock className="size-3.5" /> Password</span>} hint={link?.has_password && !f.removePassword ? 'A password is set. Type a new one to replace it.' : 'Visitors must enter this before being redirected.'}>
              <div className="flex gap-2">
                <Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} placeholder={link?.has_password && !f.removePassword ? '••••••••' : 'No password'} />
                {link?.has_password && (
                  <Button size="md" onClick={() => setF((p) => ({ ...p, removePassword: !p.removePassword, password: '' }))}>
                    {f.removePassword ? 'Keep' : 'Remove'}
                  </Button>
                )}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Goes live at" hint="Optional. Before this time the link shows “not live yet”.">
                <Input type="datetime-local" value={toLocalInput(f.starts_at)} onChange={(e) => set('starts_at', fromLocalInput(e.target.value))} />
              </Field>
              <Field label="Expires at" hint="Optional. After this time the link stops redirecting.">
                <Input type="datetime-local" value={toLocalInput(f.expires_at)} onChange={(e) => set('expires_at', fromLocalInput(e.target.value))} />
              </Field>
              <Field label="Click limit" hint="Stop after this many clicks.">
                <Input type="number" min={1} value={f.max_clicks} onChange={(e) => set('max_clicks', e.target.value)} placeholder="Unlimited" />
              </Field>
              <Field label="After expiry, send visitors to" hint="Optional. Otherwise they see an “expired” page.">
                <Input type="url" value={f.expired_url} onChange={(e) => set('expired_url', e.target.value)} placeholder="https://…" />
              </Field>
            </div>
            <div className="rounded-xl border border-line p-4">
              <Switch checked={f.warning} onChange={(v) => set('warning', v)} label="Show a safety warning" description="Show visitors the full destination and ask them to confirm before continuing." />
            </div>
          </div>
        )}

        {tab === 'utm' && (
          <div className="space-y-4">
            <p className="text-sm text-muted">UTM parameters are added to the destination so Google Analytics and similar tools can attribute traffic. Existing parameters are never overwritten.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(['source', 'medium', 'campaign', 'term', 'content'] as const).map((k) => (
                <Field key={k} label={`utm_${k}`}>
                  <Input
                    value={f.utm[k] ?? ''}
                    onChange={(e) => set('utm', { ...f.utm, [k]: e.target.value })}
                    placeholder={{ source: 'newsletter', medium: 'email', campaign: 'summer_sale', term: '', content: 'header_button' }[k]}
                    maxLength={100}
                  />
                </Field>
              ))}
            </div>
            {finalUrl && (
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="mb-1 text-xs font-medium text-muted">Visitors will land on</p>
                <p className="break-all font-mono text-xs">{finalUrl}</p>
              </div>
            )}
          </div>
        )}
        <button type="submit" hidden />
      </form>
      {f.url && hostOf(f.url) === window.location.hostname && <p className={cx('mt-4 text-sm text-warn-fg')}>This destination points back to this shortener, which is not allowed.</p>}
    </Drawer>
  );
}
