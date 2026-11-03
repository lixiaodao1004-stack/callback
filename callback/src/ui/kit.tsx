import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Relationship } from '../lib/types';

// ---- Routing (hash based) ----
export function useRoute(): string[] {
  const get = () => (window.location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent);
  const [r, setR] = useState(get);
  useEffect(() => {
    const on = () => {
      setR(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
export const go = (path: string) => {
  window.location.hash = path.startsWith('#') ? path : '#' + path;
};

export function Badge({ tone = 'neutral', children, title }: { tone?: 'green' | 'violet' | 'warn' | 'danger' | 'info' | 'neutral'; children: ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Banner({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'danger' | 'demo'; children: ReactNode; icon?: string }) {
  const def = { info: 'ℹ', warn: '⚠', danger: '⛔', demo: '◆' }[tone];
  return (
    <div className={`banner ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span aria-hidden="true">{icon ?? def}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string | null; children: ReactNode; id?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
      {error && (
        <div className="error-text" role="alert">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

export function Tabs({ tabs, current, base }: { tabs: [string, string][]; current: string; base: string }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <a key={k} role="tab" aria-selected={current === k} className="tab" href={`#${base}/${k}`}>
          {label}
        </a>
      ))}
    </div>
  );
}

export function LocalTabs<T extends string>({ tabs, current, onChange }: { tabs: [T, string][]; current: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={current === k} className="tab" onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export const REL_LABEL: Record<Relationship, string> = {
  direct: 'Direct evidence',
  transferable: 'Transferable evidence',
  needs_detail: 'Needs more detail',
  none_added: 'No evidence added',
};
export function RelBadge({ r }: { r: Relationship }) {
  const tone = r === 'direct' ? 'green' : r === 'transferable' ? 'info' : r === 'needs_detail' ? 'warn' : 'neutral';
  const icon = r === 'direct' ? '●' : r === 'transferable' ? '◐' : r === 'needs_detail' ? '◌' : '○';
  return <Badge tone={tone}>{icon} {REL_LABEL[r]}</Badge>;
}
export function ValidationBadge({ v }: { v: 'valid' | 'unverified' | 'stale' }) {
  if (v === 'valid') return <Badge tone="green">✓ Source verified</Badge>;
  if (v === 'stale') return <Badge tone="warn">↻ Out of date</Badge>;
  return <Badge tone="danger">? Source could not be verified</Badge>;
}

export function Highlighted({ text, start, end }: { text: string; start?: number; end?: number }) {
  if (start === undefined || end === undefined || start < 0 || end > text.length) return <div className="source-text">{text}</div>;
  return (
    <div className="source-text">
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </div>
  );
}

export function Confirm({ open, title, children, confirmLabel, danger, onConfirm, onCancel }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    if (open) window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        <div>{children}</div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onCancel} ref={ref}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Stepper({ steps, current, done }: { steps: string[]; current: number; done?: boolean[] }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? 'step' : undefined} className={done?.[i] ? 'done' : ''}>
          {done?.[i] ? '✓' : i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}

export function ModeTag({ mode }: { mode: 'prepared_example' | 'self_review' | 'live' | 'manual' | 'rules' }) {
  const m = {
    prepared_example: ['violet', '◆ Prepared example'],
    self_review: ['neutral', '✎ Self-review'],
    live: ['green', '● Live AI'],
    manual: ['neutral', '✎ Manual'],
    rules: ['neutral', '⚙ Offline rules'],
  } as const;
  const [tone, label] = m[mode];
  return <Badge tone={tone}>{label}</Badge>;
}

export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
