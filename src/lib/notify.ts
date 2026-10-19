// notify.tsx — CenPaya's single notification system.
// 1) Put this file in src/lib/notify.tsx
// 2) In main.tsx:  import { installNotify, NotifyHost } from './lib/notify';
//                  installNotify();            // BEFORE render
//                  render <NotifyHost /> once, next to <App />
// After that, every alert("..."), every unhandled error and every
// notify.* call shows the CenPaya toast. The browser dialog
// ("cenpaya.pages.dev says") never appears again.

import { useSyncExternalStore, useEffect, useState } from 'react';

type Kind = 'error' | 'success' | 'info' | 'warning';
type Source = 'app' | 'server';

export interface Toast {
  id: number;
  kind: Kind;
  source: Source;
  title: string;
  message: string;
  code?: string;
  technical?: string;
}

/* ───────────── store ───────────── */
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(t: Omit<Toast, 'id'>) {
  // Collapse identical consecutive toasts so a failing loop can't spam the screen.
  if (toasts.some((x) => x.message === t.message && x.title === t.title)) return;
  const toast = { ...t, id: nextId++ };
  toasts = [...toasts.slice(-2), toast]; // max 3 visible
  emit();
  if (t.kind !== 'error') setTimeout(() => dismiss(toast.id), 4500);
}
export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/* ───────────── Supabase / Postgres error translation ───────────── */
interface Friendly { title: string; message: string }

function translateServerError(code: string | undefined, raw: string, status?: number): Friendly {
  const m = raw.toLowerCase();

  if (code === '42501' || m.includes('row-level security') || m.includes('permission denied'))
    return { title: 'Not allowed', message: "Your account doesn't have permission to do this." };

  if (code === 'PGRST116' || m.includes('0 rows') || m.includes('cannot coerce') || m.includes('no rows'))
    return { title: 'Not found', message: 'This item no longer exists or was removed.' };

  if (code === '23505' || m.includes('duplicate key'))
    return { title: 'Already exists', message: 'This entry already exists.' };

  if (code === '23503' || m.includes('foreign key'))
    return { title: 'Item unavailable', message: 'This is linked to something that no longer exists.' };

  if (code === '23502' || m.includes('null value in column'))
    return { title: 'Missing information', message: 'A required field is empty. Fill it in and try again.' };

  if (code === '22P02' || code === '22007' || m.includes('invalid input'))
    return { title: 'Invalid value', message: 'One of the values you entered is not valid.' };

  if (code === 'PGRST301' || m.includes('jwt') || m.includes('refresh token') || status === 401)
    return { title: 'Session expired', message: 'Log in again to continue.' };

  if (m.includes('invalid login credentials'))
    return { title: 'Wrong credentials', message: 'Check your details and try again.' };

  if (status === 429 || m.includes('rate limit') || m.includes('too many'))
    return { title: 'Too many attempts', message: 'Wait a moment before trying again.' };

  if (status && status >= 500)
    return { title: 'Server problem', message: 'Our server had a problem. Try again in a moment.' };

  // Errors raised on purpose by your SQL functions (RAISE EXCEPTION 'Exceeds available gains.')
  // are already written for people: show them as they are.
  if (code === 'P0001' && raw) return { title: 'Request declined', message: raw };

  return { title: 'Server error', message: raw || 'Something went wrong on the server.' };
}

function isNetworkError(e: any) {
  const m = String(e?.message ?? e).toLowerCase();
  return m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed');
}

function looksLikeSupabase(e: any) {
  if (!e || typeof e !== 'object') return false;
  const n = String(e.name ?? '');
  return (
    n.includes('Postgrest') || n.includes('AuthApi') || n.includes('Storage') ||
    ('code' in e && 'message' in e && ('details' in e || 'hint' in e)) ||
    ('status' in e && 'message' in e && n.includes('Auth'))
  );
}

/* ───────────── public API ───────────── */
export const notify = {
  error: (message: string, title = 'Something went wrong') =>
    push({ kind: 'error', source: 'app', title, message }),
  success: (message: string, title = 'Done') =>
    push({ kind: 'success', source: 'app', title, message }),
  info: (message: string, title = 'Notice') =>
    push({ kind: 'info', source: 'app', title, message }),
  warning: (message: string, title = 'Heads up') =>
    push({ kind: 'warning', source: 'app', title, message }),

  /** Use in catch blocks or after a Supabase call:  if (error) notify.fromError(error) */
  fromError(e: unknown) {
    const err: any = e;
    if (isNetworkError(err)) {
      return push({
        kind: 'warning', source: 'app', title: 'No connection',
        message: 'Check your internet connection and try again.',
      });
    }
    if (looksLikeSupabase(err)) {
      const f = translateServerError(err.code, String(err.message ?? ''), err.status);
      return push({
        kind: 'error', source: 'server', ...f,
        code: err.code ? String(err.code) : undefined,
        technical: [err.message, err.details, err.hint].filter(Boolean).join(' — '),
      });
    }
    const msg = typeof err === 'string' ? err : err?.message ?? 'Unexpected error.';
    // Plain strings that still came from Supabase (old alert(error.message) calls)
    if (/row-level security|violates|jwt|pgrst|duplicate key|does not exist|0 rows/i.test(msg)) {
      const f = translateServerError(undefined, msg);
      return push({ kind: 'error', source: 'server', ...f, technical: msg });
    }
    push({ kind: 'error', source: 'app', title: 'Something went wrong', message: msg });
  },
};

/** Call once before rendering. Replaces window.alert and catches stray errors. */
export function installNotify() {
  window.alert = (msg?: unknown) => {
    const text = String(msg ?? '');
    if (/^(success|done|saved|sent)/i.test(text)) notify.success(text);
    else notify.fromError(text);
  };
  window.addEventListener('unhandledrejection', (ev) => {
    ev.preventDefault();
    notify.fromError(ev.reason);
  });
  window.addEventListener('error', (ev) => {
    if (ev.message?.includes('ResizeObserver')) return;
    notify.fromError(ev.error ?? ev.message);
  });
}

/* ───────────── UI ───────────── */
const CSS = `
.cp-host{position:fixed;left:0;right:0;top:0;z-index:2147483000;display:flex;flex-direction:column;
  gap:10px;padding:calc(env(safe-area-inset-top,0px) + 12px) 12px 0;pointer-events:none}
.cp-toast{pointer-events:auto;max-width:480px;width:100%;margin:0 auto;display:grid;
  grid-template-columns:44px 1fr auto;gap:12px;align-items:start;padding:14px 12px 14px 14px;
  background:var(--cp-bg);color:var(--cp-fg);border-radius:18px;
  border:1px solid var(--cp-line);box-shadow:0 12px 32px -12px rgba(0,0,0,.35);
  animation:cp-in .28s cubic-bezier(.2,.9,.3,1.2)}
.cp-ico{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;
  background:var(--cp-tint);color:var(--cp-accent)}
.cp-ico svg{width:22px;height:22px}
.cp-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cp-title{font:700 15px/1.3 system-ui,sans-serif;margin:0}
.cp-badge{font:600 11px/1 system-ui,sans-serif;padding:4px 8px;border-radius:999px;
  background:var(--cp-tint);color:var(--cp-accent)}
.cp-msg{font:400 14px/1.45 system-ui,sans-serif;margin:4px 0 0;opacity:.85}
.cp-more{margin-top:8px;font:500 12px system-ui,sans-serif;color:var(--cp-accent);
  background:none;border:0;padding:0;cursor:pointer}
.cp-tech{margin:6px 0 0;padding:8px 10px;border-radius:10px;background:var(--cp-tint);
  font:12px/1.4 ui-monospace,monospace;word-break:break-word;opacity:.9}
.cp-x{background:none;border:0;color:inherit;opacity:.5;font-size:20px;line-height:1;
  padding:4px 8px;cursor:pointer;border-radius:8px}
.cp-x:focus-visible,.cp-more:focus-visible{outline:2px solid var(--cp-accent);outline-offset:2px}
.cp-error{--cp-accent:#c2362b;--cp-tint:rgba(194,54,43,.12)}
.cp-warning{--cp-accent:#a8680a;--cp-tint:rgba(168,104,10,.14)}
.cp-success{--cp-accent:#0f8a4b;--cp-tint:rgba(15,138,75,.13)}
.cp-info{--cp-accent:#2563a8;--cp-tint:rgba(37,99,168,.12)}
.cp-toast{--cp-bg:#fff;--cp-fg:#14211b;--cp-line:rgba(20,33,27,.1)}
.cp-toast.cp-server{border-left:5px solid var(--cp-accent)}
@media (prefers-color-scheme:dark){
  .cp-toast{--cp-bg:#18221d;--cp-fg:#eef4f0;--cp-line:rgba(255,255,255,.1)}
  .cp-error{--cp-accent:#ff8a7f}.cp-warning{--cp-accent:#f0b25a}
  .cp-success{--cp-accent:#4fd18b}.cp-info{--cp-accent:#7fb4f0}
}
html.dark .cp-toast,[data-theme=dark] .cp-toast{--cp-bg:#18221d;--cp-fg:#eef4f0;--cp-line:rgba(255,255,255,.1)}
@keyframes cp-in{from{opacity:0;transform:translateY(-14px) scale(.97)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.cp-toast{animation:none}}
`;

const ICONS: Record<Kind | 'server', JSX.Element> = {
  error: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>,
  warning: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>,
  success: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16 9.8"/></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.01"/></svg>,
  server: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4" width="17" height="6.5" rx="2"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="2"/><path d="M7.5 7.3v.01M7.5 16.8v.01"/></svg>,
};

function Item({ t }: { t: Toast }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`cp-toast cp-${t.kind} ${t.source === 'server' ? 'cp-server' : ''}`}
         role={t.kind === 'error' ? 'alert' : 'status'}>
      <div className="cp-ico">{t.source === 'server' ? ICONS.server : ICONS[t.kind]}</div>
      <div>
        <div className="cp-head">
          <h4 className="cp-title">{t.title}</h4>
          {t.source === 'server' && <span className="cp-badge">Server{t.code ? ` · ${t.code}` : ''}</span>}
        </div>
        <p className="cp-msg">{t.message}</p>
        {t.technical && (
          <>
            <button className="cp-more" onClick={() => setOpen(!open)}>
              {open ? 'Hide details' : 'Show details'}
            </button>
            {open && <p className="cp-tech">{t.technical}</p>}
          </>
        )}
      </div>
      <button className="cp-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
    </div>
  );
}

export function NotifyHost() {
  const list = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => toasts
  );
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
  return <div className="cp-host">{list.map((t) => <Item key={t.id} t={t} />)}</div>;
              }
