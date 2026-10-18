import React from "react";

const CSS = `
:root{--cp-bg:#eef2f0;--cp-card:#fff;--cp-ink:#12261c;--cp-mute:#6f8077;--cp-line:#e6ece8;--cp-g:#12935a;--cp-gd:#0a3d2b;--cp-red:#e5484d;
--cp-r:18px;--cp-shadow:0 1px 4px rgba(10,61,43,.08);--cp-nav-h:96px;--cp-nav-z:900;color-scheme:light}
:where(html){-webkit-text-size-adjust:100%;scroll-behavior:smooth}
:where(body){margin:0;background:var(--cp-bg);color:var(--cp-ink);font:15px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;overscroll-behavior-y:none}
:where(h1){font-size:24px;line-height:1.2;letter-spacing:-.3px}:where(h2){font-size:20px;line-height:1.25}:where(h3){font-size:16px}
:where(h1,h2,h3,h4){color:var(--cp-ink);margin:0 0 8px;font-weight:700}
:where(a){color:var(--cp-g);text-decoration:none;font-weight:600}
:where(button){font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
:where(button:not([class]),[type=submit]){background:var(--cp-g);color:#fff;border:0;border-radius:14px;padding:12px 18px;font-weight:700;transition:transform .1s,opacity .15s}
:where(button:active){transform:scale(.97)}:where(button:disabled){opacity:.5;cursor:not-allowed}
:where(input:not([type=checkbox],[type=radio],[type=file],[type=range]),select,textarea){width:100%;background:#f8faf9;color:var(--cp-ink);border:1.5px solid var(--cp-line);border-radius:14px;padding:13px 14px;font:inherit;outline:none;-webkit-text-fill-color:var(--cp-ink);box-sizing:border-box}
:where(input,textarea)::placeholder{color:#93a29b;-webkit-text-fill-color:#93a29b}
:where(input:focus,select:focus,textarea:focus){border-color:var(--cp-g);background:#fff;box-shadow:0 0 0 3px rgba(18,147,90,.15)}
:where(label){display:block;font-weight:600;color:#3e4f47;margin:10px 0 6px;font-size:14px}
:where(input[type=checkbox],input[type=radio]){accent-color:var(--cp-g);width:20px;height:20px}
:where([class*="card" i]){background:var(--cp-card);border-radius:var(--cp-r);box-shadow:var(--cp-shadow)}
:where(table){width:100%;border-collapse:collapse;background:var(--cp-card);border-radius:var(--cp-r);overflow:hidden}
:where(th){font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--cp-mute);text-align:left;padding:10px 14px;background:#f8faf9}
:where(td){padding:12px 14px;border-top:1px solid var(--cp-line)}
:where([role=dialog]){background:var(--cp-card);color:var(--cp-ink);border-radius:24px}
:where(hr){border:0;border-top:1px solid var(--cp-line)}
:where(::selection){background:#bfe8d1}
/* the floating bottom bar can never cover content or sheets again */
:where(nav[class*="bottom" i],[class*="tabbar" i],[class*="bottom-nav" i],[class*="floating" i]){z-index:var(--cp-nav-z)!important}
:where(main,#root>div){scroll-padding-bottom:var(--cp-nav-h)}
.cp-page{padding:14px 16px calc(var(--cp-nav-h) + env(safe-area-inset-bottom,0px) + 16px);max-width:760px;margin:0 auto}
.cp-title{display:flex;align-items:center;gap:10px;margin:6px 0 14px}.cp-title h1{margin:0;font-size:22px}.cp-title small{display:block;color:var(--cp-mute);font-weight:400}
.cp-card{background:var(--cp-card);border-radius:var(--cp-r);box-shadow:var(--cp-shadow);padding:16px;margin-bottom:12px}.cp-card.flush{padding:0;overflow:hidden}
.cp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:14px;padding:12px 18px;font-weight:700;background:var(--cp-g);color:#fff}
.cp-btn.dark{background:var(--cp-gd)}.cp-btn.ghost{background:transparent;color:var(--cp-g);border:1.5px solid var(--cp-g)}.cp-btn.soft{background:#eaf6ef;color:var(--cp-g)}.cp-btn.danger{background:#fdecec;color:#d92d33}.cp-btn.block{width:100%}
.cp-row{display:flex;align-items:center;gap:12px;padding:13px 14px;background:#fff;border:0;width:100%;text-align:left;color:var(--cp-ink);font-weight:600}
.cp-row+.cp-row{border-top:1px solid var(--cp-line)}
.cp-ico{width:38px;height:38px;border-radius:12px;background:#eaf6ef;color:var(--cp-g);display:grid;place-items:center;flex:none}
.cp-tabs{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:none}.cp-tabs::-webkit-scrollbar{display:none}
.cp-tab{flex:none;padding:9px 16px;border-radius:20px;border:1px solid var(--cp-line);background:#fff;color:#44544c;font-weight:600}.cp-tab.on{background:var(--cp-gd);color:#fff;border-color:var(--cp-gd)}
.cp-empty{text-align:center;color:var(--cp-mute);padding:36px 20px}.cp-empty b{display:block;color:var(--cp-ink);font-size:16px;margin-bottom:4px}
.cp-badge{display:inline-block;background:#eaf6ef;color:var(--cp-g);border-radius:12px;padding:3px 10px;font-size:12px;font-weight:700}
`;

export const DesignSystem: React.FC<{ children: React.ReactNode }> = ({ children }) => (<><style>{CSS}</style>{children}</>);

/* ---------- primitives ---------- */
export const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="cp-page">{children}</div>;

export const PageTitle: React.FC<{ title: string; sub?: string; onBack?: () => void; right?: React.ReactNode }> = ({ title, sub, onBack, right }) => (
  <div className="cp-title">
    {onBack && <button className="cp-btn soft" style={{ padding: 10 }} onClick={onBack} aria-label="Back">←</button>}
    <div style={{ flex: 1 }}><h1>{title}</h1>{sub && <small>{sub}</small>}</div>{right}
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; flush?: boolean; title?: string }> = ({ children, flush, title }) => (
  <section className={`cp-card ${flush ? "flush" : ""}`}>{title && <h3 style={{ padding: flush ? "14px 14px 0" : 0 }}>{title}</h3>}{children}</section>
);

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "dark" | "ghost" | "soft" | "danger"; block?: boolean }> = ({ tone, block, className = "", ...p }) => (
  <button {...p} className={`cp-btn ${tone ?? ""} ${block ? "block" : ""} ${className}`} />
);

export const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...p }) => (<><label>{label}</label><input {...p} /></>);

export const Row: React.FC<{ icon?: React.ReactNode; label: string; right?: React.ReactNode; onClick?: () => void }> = ({ icon, label, right, onClick }) => (
  <button className="cp-row" onClick={onClick}>{icon && <span className="cp-ico">{icon}</span>}<span style={{ flex: 1 }}>{label}</span>{right ?? <span style={{ color: "#b4c0ba" }}>›</span>}</button>
);

export const Tabs: React.FC<{ items: string[]; value: string; onChange: (v: string) => void }> = ({ items, value, onChange }) => (
  <div className="cp-tabs" role="tablist">{items.map((i) => <button key={i} role="tab" aria-selected={i === value} className={`cp-tab ${i === value ? "on" : ""}`} onClick={() => onChange(i)}>{i}</button>)}</div>
);

export const Empty: React.FC<{ icon?: string; title: string; text?: string }> = ({ icon = "🗂", title, text }) => (<div className="cp-card cp-empty"><div style={{ fontSize: 32 }}>{icon}</div><b>{title}</b>{text}</div>);
