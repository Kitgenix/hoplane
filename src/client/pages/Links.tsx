import { BarChart3, ChevronLeft, ChevronRight, Link2, Lock, MoreHorizontal, Pencil, Plus, Power, QrCode, Route, Search, Shuffle, Tag, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useLocation, useSearch } from 'wouter';
import type { Link, LinkStatus } from '../../shared/types';
import { PageHeader } from '../components/Layout';
import { LinkEditor } from '../components/LinkEditor';
import { QrDialog } from '../components/QrDialog';
import { Badge, Button, Card, CopyButton, Empty, HostAvatar, IconButton, Input, Modal, Select, Skeleton, cx, useConfirm, useToast } from '../components/ui';
import { api } from '../lib/api';
import { ago, hostOf, num, short } from '../lib/format';
import { useAsync, useDebounced, useSession } from '../lib/hooks';

type Row = Link & { status: LinkStatus };

const STATUS: Record<LinkStatus, { label: string; tone: 'good' | 'bad' | 'warn' | 'neutral' | 'brand' | 'info' }> = {
  active: { label: 'Active', tone: 'good' },
  disabled: { label: 'Off', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'bad' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  limit: { label: 'Limit reached', tone: 'warn' },
};

export function StatusBadge({ status }: { status: LinkStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}

export function LinkFeatures({ link }: { link: Link }) {
  const items = [
    link.has_password && { icon: Lock, label: 'Password protected' },
    link.rules.length > 0 && { icon: Route, label: `${link.rules.length} targeting rule${link.rules.length > 1 ? 's' : ''}` },
    link.variants.length > 0 && { icon: Shuffle, label: `A/B split across ${link.variants.length}` },
  ].filter(Boolean) as { icon: typeof Lock; label: string }[];
  if (!items.length) return null;
  return (
    <span className="flex items-center gap-1 text-muted">
      {items.map((i) => (
        <i.icon key={i.label} className="size-3.5" aria-label={i.label} />
      ))}
    </span>
  );
}

function RowMenu({ onEdit, onToggle, onDelete, disabled }: { onEdit: () => void; onToggle: () => void; onDelete: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const item = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-2 cursor-pointer';
  return (
    <div className="relative" ref={ref}>
      <IconButton label="More actions" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-4" />
      </IconButton>
      {open && (
        <div className="animate-fade-in absolute right-0 z-20 mt-1 w-44 rounded-xl border border-line bg-surface p-1 shadow-xl" onClick={() => setOpen(false)}>
          <button type="button" className={item} onClick={onEdit}>
            <Pencil className="size-4" /> Edit
          </button>
          <button type="button" className={item} onClick={onToggle}>
            <Power className="size-4" /> {disabled ? 'Turn on' : 'Turn off'}
          </button>
          <button type="button" className={cx(item, 'text-bad-fg')} onClick={onDelete}>
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function LinksPage() {
  const { can } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const [q, setQ] = useState(params.get('q') ?? '');
  const [tag, setTag] = useState(params.get('tag') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? 'all');
  const [sort, setSort] = useState(params.get('sort') ?? 'created_desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ open: boolean; link: Link | null }>({ open: params.get('new') === '1', link: null });
  const [qr, setQr] = useState<Link | null>(null);
  const [tagModal, setTagModal] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const dq = useDebounced(q, 250);
  const writable = can('links:write');

  useEffect(() => setPage(1), [dq, tag, status, sort]);
  const { data, loading, reload } = useAsync(
    (signal) => api<{ items: Row[]; total: number; page: number; limit: number }>('/links', { query: { q: dq, tag, status, sort, page, limit: 25 }, signal }),
    [dq, tag, status, sort, page],
  );
  const tags = useAsync((signal) => api<{ items: { tag: string; count: number }[] }>('/tags', { signal }), [data?.total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === 'c' && writable) {
        e.preventDefault();
        setEditor({ open: true, link: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [writable]);

  const items = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const allSelected = items.length > 0 && items.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((l) => l.id)));
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const bulk = async (action: 'delete' | 'disable' | 'enable' | 'tag', ids = [...selected], tagsToAdd?: string[]) => {
    if (action === 'delete' && !(await confirm({ title: `Delete ${ids.length} link${ids.length > 1 ? 's' : ''}?`, message: 'The short links will stop working and their analytics will be deleted. This cannot be undone.', confirm: 'Delete', danger: true }))) return;
    const r = await api<{ affected: number }>('/links/bulk', { body: { action, ids, tags: tagsToAdd } });
    toast(`${r.affected} link${r.affected === 1 ? '' : 's'} updated`, 'good');
    setSelected(new Set());
    reload();
  };

  return (
    <>
      <PageHeader
        title="Links"
        description={data ? `${num(data.total)} link${data.total === 1 ? '' : 's'}` : 'Loading…'}
        actions={
          writable && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditor({ open: true, link: null })}>
              Create link <kbd className="ml-1 hidden rounded bg-white/20 px-1.5 text-[11px] font-medium sm:inline">C</kbd>
            </Button>
          )
        }
      />

      <Card padded={false}>
        <div className="flex flex-col gap-2 border-b border-line p-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" />
            <Input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search slugs, URLs, titles, notes…  ( / )" className="pl-9" aria-label="Search links" />
          </div>
          <div className="grid grid-cols-3 gap-2 md:flex">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="md:w-36">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Off</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="limit">Limit reached</option>
            </Select>
            <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag" className="md:w-36">
              <option value="">All tags</option>
              {tags.data?.items.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.tag} ({t.count})
                </option>
              ))}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="md:w-40">
              <option value="created_desc">Newest first</option>
              <option value="created_asc">Oldest first</option>
              <option value="clicks_desc">Most clicks</option>
              <option value="recent_click">Recently clicked</option>
              <option value="slug_asc">Slug A–Z</option>
            </Select>
          </div>
        </div>

        {selected.size > 0 && writable && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-soft/60 px-4 py-2 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <span className="flex-1" />
            <Button size="sm" icon={<Tag className="size-4" />} onClick={() => setTagModal(true)}>
              Add tag
            </Button>
            <Button size="sm" onClick={() => bulk('enable')}>Turn on</Button>
            <Button size="sm" onClick={() => bulk('disable')}>Turn off</Button>
            <Button size="sm" variant="danger" onClick={() => bulk('delete')}>Delete</Button>
          </div>
        )}

        {loading && !data ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !items.length ? (
          <Empty
            icon={<Link2 className="size-5" />}
            title={dq || tag || status !== 'all' ? 'No links match your filters' : 'Create your first short link'}
            action={writable && !dq && !tag && status === 'all' && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditor({ open: true, link: null })}>Create link</Button>}
          >
            {dq || tag || status !== 'all' ? 'Try a different search or clear the filters.' : 'Shorten a URL, add a QR code, and watch the clicks roll in.'}
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            <li className="hidden items-center gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted md:flex">
              {writable && <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="size-4 accent-[var(--brand)]" />}
              <span className="flex-1">Link</span>
              <span className="w-24 text-right">Clicks</span>
              <span className="w-28">Status</span>
              <span className="w-32" />
            </li>
            {items.map((l) => (
              <li key={l.id} className={cx('group flex items-center gap-4 px-4 py-3 transition hover:bg-surface-2/50', selected.has(l.id) && 'bg-brand-soft/40')}>
                {writable && <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.slug}`} className="size-4 shrink-0 accent-[var(--brand)]" />}
                <HostAvatar host={hostOf(l.url)} className="hidden sm:grid" />
                <button type="button" onClick={() => navigate(`/links/${l.id}`)} className="min-w-0 flex-1 cursor-pointer text-left">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {window.location.host}/<span className="text-brand-fg">{l.slug}</span>
                    </span>
                    <LinkFeatures link={l} />
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">
                    <span className="truncate">{l.title || l.url}</span>
                    {l.tags.slice(0, 3).map((t) => (
                      <Badge key={t} className="hidden lg:inline-flex">{t}</Badge>
                    ))}
                  </span>
                </button>
                <span className="w-24 text-right">
                  <span className="block font-semibold tabular">{short(l.clicks)}</span>
                  <span className="block text-xs text-muted">{l.last_clicked_at ? ago(l.last_clicked_at) : 'No clicks'}</span>
                </span>
                <span className="hidden w-28 md:block">
                  <StatusBadge status={l.status} />
                </span>
                <span className="flex w-auto items-center justify-end gap-0.5 md:w-32">
                  <CopyButton text={l.short_url ?? `${window.location.origin}/${l.slug}`} label="Copy short link" />
                  <IconButton label="QR code" onClick={() => setQr(l)} className="hidden sm:inline-grid">
                    <QrCode className="size-4" />
                  </IconButton>
                  <RouterLink href={`/links/${l.id}`} className="hidden size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text sm:grid" aria-label="Analytics">
                    <BarChart3 className="size-4" />
                  </RouterLink>
                  {writable && (
                    <RowMenu
                      disabled={l.disabled}
                      onEdit={() => setEditor({ open: true, link: l })}
                      onToggle={() => bulk(l.disabled ? 'enable' : 'disable', [l.id])}
                      onDelete={() => bulk('delete', [l.id])}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {data && data.total > data.limit && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-muted">
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" icon={<ChevronLeft className="size-4" />} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <LinkEditor open={editor.open} link={editor.link} onClose={() => setEditor({ open: false, link: null })} onSaved={() => reload()} />
      {qr && <QrDialog open onClose={() => setQr(null)} url={qr.short_url ?? `${window.location.origin}/${qr.slug}`} slug={qr.slug} />}
      <Modal
        open={tagModal}
        onClose={() => setTagModal(false)}
        title="Add a tag to selected links"
        size="sm"
        footer={
          <>
            <Button onClick={() => setTagModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!bulkTag.trim()}
              onClick={async () => {
                await bulk('tag', [...selected], [bulkTag.trim()]);
                setBulkTag('');
                setTagModal(false);
              }}
            >
              Add tag
            </Button>
          </>
        }
      >
        <Input autoFocus value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="campaign-2026" list="bulk-tags" />
        <datalist id="bulk-tags">{tags.data?.items.map((t) => <option key={t.tag} value={t.tag} />)}</datalist>
      </Modal>
    </>
  );
}
