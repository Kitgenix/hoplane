import { ArrowLeft, Calendar, ExternalLink, Lock, Pencil, QrCode, Route, Shuffle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, useLocation } from 'wouter';
import type { Link, LinkStatus } from '../../shared/types';
import { AnalyticsPanel } from '../components/AnalyticsPanel';
import { LinkEditor } from '../components/LinkEditor';
import { QrDialog, qrSvg } from '../components/QrDialog';
import { Badge, Button, Card, CopyButton, Empty, HostAvatar, Skeleton, useConfirm, useToast } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, hostOf } from '../lib/format';
import { useAsync, useSession } from '../lib/hooks';
import { StatusBadge } from './Links';

export function LinkDetailPage({ id }: { id: string }) {
  const { can } = useSession();
  const [, navigate] = useLocation();
  const toast = useToast();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const [qr, setQr] = useState(false);
  const { data: link, loading, error, reload, setData } = useAsync((signal) => api<Link & { status: LinkStatus }>(`/links/${encodeURIComponent(id)}`, { signal }), [id]);

  if (loading && !link) return <Skeleton className="h-40" />;
  if (error || !link)
    return (
      <Empty title="Link not found" action={<Button onClick={() => navigate('/links')}>Back to links</Button>}>
        It may have been deleted.
      </Empty>
    );

  const shortUrl = link.short_url ?? `${window.location.origin}/${link.slug}`;
  const del = async () => {
    if (!(await confirm({ title: 'Delete this link?', message: `${shortUrl} will stop working and its analytics will be deleted.`, confirm: 'Delete', danger: true }))) return;
    await api(`/links/${link.id}`, { method: 'DELETE' });
    toast('Link deleted', 'good');
    navigate('/links');
  };

  const facts: [string, React.ReactNode][] = [
    ['Created', dateTime(link.created_at)],
    ['Redirect', `${link.redirect_code} ${link.redirect_code === 301 || link.redirect_code === 308 ? 'permanent' : 'temporary'}`],
    ...(link.starts_at ? [['Goes live', dateTime(link.starts_at)] as [string, string]] : []),
    ...(link.expires_at ? [['Expires', dateTime(link.expires_at)] as [string, string]] : []),
    ...(link.max_clicks ? [['Click limit', `${link.clicks} / ${link.max_clicks}`] as [string, string]] : []),
  ];

  return (
    <>
      <RouterLink href="/links" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" /> All links
      </RouterLink>

      <Card className="mb-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <button type="button" onClick={() => setQr(true)} className="hidden shrink-0 cursor-pointer rounded-xl border border-line bg-white p-2 transition hover:shadow-md md:block" aria-label="Open QR code">
            <img alt="" className="size-24" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(shortUrl + '?qr', { fg: '#071b3a', bg: '#ffffff', style: 'rounded', ecc: 'M', margin: 0 }))}`} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {window.location.host}/<span className="text-brand-fg">{link.slug}</span>
              </h1>
              <CopyButton text={shortUrl} label="Copy short link" />
              <StatusBadge status={link.status} />
            </div>
            {link.title && <p className="mt-1 font-medium">{link.title}</p>}
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted hover:text-text">
              <HostAvatar host={hostOf(link.url)} className="size-5 rounded text-[10px]" />
              <span className="truncate">{link.url}</span>
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {link.tags.map((t) => (
                <RouterLink key={t} href={`/links?tag=${encodeURIComponent(t)}`}>
                  <Badge tone="brand">{t}</Badge>
                </RouterLink>
              ))}
              {link.has_password && <Badge><Lock className="size-3" /> Password</Badge>}
              {link.rules.length > 0 && <Badge><Route className="size-3" /> {link.rules.length} rules</Badge>}
              {link.variants.length > 0 && <Badge><Shuffle className="size-3" /> A/B × {link.variants.length}</Badge>}
              {link.expires_at && <Badge><Calendar className="size-3" /> Expires</Badge>}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-5">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {link.notes && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{link.notes}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button icon={<QrCode className="size-4" />} onClick={() => setQr(true)}>
              QR
            </Button>
            {can('links:write') && (
              <>
                <Button icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>
                  Edit
                </Button>
                <Button variant="ghost" aria-label="Delete" onClick={del}>
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {can('analytics:read') && <AnalyticsPanel link={link.id} />}

      <LinkEditor
        open={edit}
        link={link}
        onClose={() => setEdit(false)}
        onSaved={(l) => {
          setData({ ...l, status: link.status });
          reload();
        }}
      />
      <QrDialog open={qr} onClose={() => setQr(false)} url={shortUrl} slug={link.slug} />
    </>
  );
}
