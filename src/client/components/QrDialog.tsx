import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { encode } from 'uqr';
import { Button, Field, Input, Modal, Select, Switch, Tabs } from './ui';

type Style = 'square' | 'rounded' | 'dots';

export function qrSvg(text: string, opts: { fg: string; bg: string; style: Style; ecc: 'L' | 'M' | 'Q' | 'H'; margin?: number }) {
  const { data, size } = encode(text, { ecc: opts.ecc, border: 0 });
  const m = opts.margin ?? 2;
  const total = size + m * 2;
  const isFinder = (x: number, y: number) => (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
  let body = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y][x] || (opts.style !== 'square' && isFinder(x, y))) continue;
      const px = x + m;
      const py = y + m;
      if (opts.style === 'dots') body += `<circle cx="${px + 0.5}" cy="${py + 0.5}" r="0.42"/>`;
      else if (opts.style === 'rounded') body += `<rect x="${px + 0.06}" y="${py + 0.06}" width="0.88" height="0.88" rx="0.3"/>`;
      else body += `<rect x="${px}" y="${py}" width="1.02" height="1.02"/>`;
    }
  }
  if (opts.style !== 'square') {
    // Rounded finder patterns
    for (const [fx, fy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      const x = fx + m;
      const y = fy + m;
      body += `<path fill-rule="evenodd" d="M${x + 2},${y}h3a2,2 0 0 1 2,2v3a2,2 0 0 1 -2,2h-3a2,2 0 0 1 -2,-2v-3a2,2 0 0 1 2,-2zM${x + 2},${y + 1}a1,1 0 0 0 -1,1v3a1,1 0 0 0 1,1h3a1,1 0 0 0 1,-1v-3a1,1 0 0 0 -1,-1z"/>`;
      body += `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="${opts.style === 'square' ? 'crispEdges' : 'geometricPrecision'}"><rect width="${total}" height="${total}" fill="${opts.bg}"/><g fill="${opts.fg}">${body}</g></svg>`;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function toPng(svg: string, px: number): Promise<Blob> {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  canvas.getContext('2d')!.drawImage(img, 0, 0, px, px);
  URL.revokeObjectURL(img.src);
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
}

export function QrDialog({ open, onClose, url, slug }: { open: boolean; onClose: () => void; url: string; slug: string }) {
  const [fg, setFg] = useState('#071b3a');
  const [bg, setBg] = useState('#ffffff');
  const [style, setStyle] = useState<Style>('rounded');
  const [ecc, setEcc] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [track, setTrack] = useState(true);
  const [px, setPx] = useState(1024);
  const text = track ? `${url}${url.includes('?') ? '&' : '?'}qr` : url;
  const svg = useMemo(() => qrSvg(text, { fg, bg, style, ecc }), [text, fg, bg, style, ecc]);
  const name = `qr-${slug.replace(/\//g, '-')}`;

  return (
    <Modal open={open} onClose={onClose} title="QR code" size="lg">
      <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-full max-w-72 overflow-hidden rounded-2xl border border-line p-3" style={{ background: bg }}>
            <img alt={`QR code for ${url}`} className="w-full" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />
          </div>
          <p className="max-w-72 break-all text-center font-mono text-xs text-muted">{text}</p>
        </div>
        <div className="space-y-4">
          <Field label="Style">
            <Tabs value={style} onChange={setStyle} items={[{ value: 'rounded', label: 'Rounded' }, { value: 'dots', label: 'Dots' }, { value: 'square', label: 'Classic' }]} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Foreground">
              <div className="flex items-center gap-2">
                <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="h-9.5 w-11 cursor-pointer rounded-lg border border-line bg-surface p-1" aria-label="Foreground colour" />
                <Input value={fg} onChange={(e) => setFg(e.target.value)} className="font-mono" />
              </div>
            </Field>
            <Field label="Background">
              <div className="flex items-center gap-2">
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-9.5 w-11 cursor-pointer rounded-lg border border-line bg-surface p-1" aria-label="Background colour" />
                <Input value={bg} onChange={(e) => setBg(e.target.value)} className="font-mono" />
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Error correction" hint="Higher survives damage or print smudges.">
              <Select value={ecc} onChange={(e) => setEcc(e.target.value as typeof ecc)}>
                <option value="L">Low (7%)</option>
                <option value="M">Medium (15%)</option>
                <option value="Q">Quartile (25%)</option>
                <option value="H">High (30%)</option>
              </Select>
            </Field>
            <Field label="PNG size">
              <Select value={px} onChange={(e) => setPx(Number(e.target.value))}>
                {[512, 1024, 2048, 4096].map((n) => (
                  <option key={n} value={n}>
                    {n} × {n}px
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Switch checked={track} onChange={setTrack} label="Track scans separately" description="Adds ?qr to the code so scans show up as “QR” in analytics. It is stripped before redirecting." />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="primary" icon={<Download className="size-4" />} onClick={async () => save(await toPng(svg, px), `${name}.png`)}>
              Download PNG
            </Button>
            <Button icon={<Download className="size-4" />} onClick={() => save(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`)}>
              SVG
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
