import { Check, Copy, Loader2, X } from 'lucide-react';
import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type ComponentProps, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-110 shadow-sm shadow-brand/20',
  secondary: 'bg-surface text-text border border-line hover:bg-surface-2 hover:border-brand/30',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-bad text-white hover:brightness-110',
};

export function Button({
  variant = 'secondary', size = 'md', loading, icon, children, className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9.5 px-3.5 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('inline-grid size-8 place-items-center rounded-lg text-muted hover:text-text hover:bg-surface-2 transition cursor-pointer disabled:opacity-40', className)}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Form fields */

export function Field({ label, hint, error, children, htmlFor, className }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-text">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-bad-fg">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 h-9.5 text-sm text-text placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 transition disabled:opacity-60';

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={cx(inputCls, className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(inputCls, 'h-auto py-2 min-h-20', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(inputCls, 'pr-8 cursor-pointer', className)}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('flex items-start justify-between gap-4 cursor-pointer', disabled && 'opacity-60 cursor-not-allowed')}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted mt-0.5">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition cursor-pointer', checked ? 'bg-brand' : 'bg-line')}
      >
        <span className={cx('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition', checked && 'translate-x-4')} />
      </button>
    </label>
  );
}

/* ------------------------------------------------------------------ Surfaces */

export function Card({ children, className, title, description, actions, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; description?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-1">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="text-[13px] text-muted mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx(padded && 'p-5', padded && !!(title || actions) && 'pt-3')}>{children}</div>
    </section>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'brand' | 'info'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    good: 'bg-good/12 text-good-fg',
    bad: 'bg-bad/12 text-bad-fg',
    warn: 'bg-warn/14 text-warn-fg',
    brand: 'bg-brand-soft text-brand-fg',
    info: 'bg-info/12 text-info-fg',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && <div className="mb-3 grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-fg">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-surface-2', className)} />;
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cx('flex max-w-full gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium transition cursor-pointer',
            value === it.value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Overlays */

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

export function Drawer({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return <DrawerInner {...{ onClose, title, children, footer, wide }} />;
}
function DrawerInner({ onClose, title, children, footer, wide }: { onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx('animate-slide-in relative flex h-full w-full flex-col bg-surface shadow-2xl', wide ? 'max-w-2xl' : 'max-w-xl')}>
        <header className="flex items-center justify-between border-b border-line px-5 h-14 shrink-0">
          <h2 className="font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 shrink-0">{footer}</footer>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  if (!open) return null;
  return <ModalInner {...{ onClose, title, children, footer, size }} />;
}
function ModalInner({ onClose, title, children, footer, size }: { onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size: 'sm' | 'md' | 'lg' }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx('animate-fade-in relative w-full rounded-2xl bg-surface shadow-2xl border border-line max-h-[90vh] flex flex-col', { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' }[size])}>
        <header className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Confirm */

type ConfirmOpts = { title: string; message: ReactNode; confirm?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="sm"
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {state?.confirm ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-muted">{state?.message}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

/* ------------------------------------------------------------------ Toasts */

type Toast = { id: number; message: string; tone: 'good' | 'bad' | 'neutral' };
const ToastCtx = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((message: string, tone: Toast['tone'] = 'neutral') => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'animate-fade-in pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm shadow-lg border',
              t.tone === 'bad' ? 'bg-bad text-white border-transparent' : 'bg-text text-bg border-transparent',
            )}
          >
            {t.tone === 'good' && <Check className="size-4 text-good-fg" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ Copy */

export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text: string, label = 'Copied to clipboard') => {
      try {
        await navigator.clipboard.writeText(text);
        toast(label, 'good');
      } catch {
        toast('Could not copy. Select and copy manually.', 'bad');
      }
    },
    [toast],
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const copy = useCopy();
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label={label}
      onClick={(e) => {
        e.stopPropagation();
        copy(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <Check className="size-4 text-good-fg" /> : <Copy className="size-4" />}
    </IconButton>
  );
}

/** Coloured initial used instead of third-party favicons (no requests leave your dashboard). */
export function HostAvatar({ host, className }: { host: string; className?: string }) {
  let h = 0;
  for (const ch of host) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden="true"
      className={cx('grid size-8 shrink-0 place-items-center rounded-lg text-[13px] font-semibold uppercase', className)}
      style={{ background: `hsl(${h} 70% 55% / 0.14)`, color: `hsl(${h} 60% 45%)` }}
    >
      {host.replace(/^www\./, '').charAt(0) || '?'}
    </span>
  );
}
