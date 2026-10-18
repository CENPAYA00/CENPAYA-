import React from "react";

const CSS = `
:root{--cp-bg:#eef2f0;--cp-card:#fff;--cp-ink:#12261c;--cp-mute:#6f8077;--cp-line:#e6ece8;--cp-g:#12935a;--cp-gd:#0a3d2b;--cp-red:#e5484d;
--cp-r:18px;--cp-shadow:0 1px 4px rgba(10,61,43,.08);--cp-nav-h:96px;--cp-nav-z:900;color-scheme:light}
:where(html){-webkit-text-size-adjust:100%;scroll-behavior:smooth}
:where(body){margin:0;background:var(--cp-bg);color:var(--cp-ink);font:15px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;overscroll-behavior-y:none}

/* FORCE HEADINGS */
h1, h2, h3, h4 { color: var(--cp-ink) !important; margin: 0 0 8px !important; font-weight: 700 !important; }
h1 { font-size: 24px !important; line-height: 1.2 !important; letter-spacing: -.3px !important; }
h2 { font-size: 20px !important; line-height: 1.25 !important; }
h3 { font-size: 16px !important; }

/* FORCE ALL BUTTONS (Except ones with Tailwind text colors) */
button { 
  font: inherit !important; 
  cursor: pointer !important; 
  -webkit-tap-highlight-color: transparent !important; 
  touch-action: manipulation !important; 
  transition: transform .1s, opacity .15s !important; 
}
button:not([class*="bg-"]):not([class*="text-"]), [type=submit] {
  background: var(--cp-g) !important; 
  color: #fff !important; 
  border: 0 !important; 
  border-radius: 14px !important; 
  padding: 12px 18px !important; 
  font-weight: 700 !important;
}
button:active { transform: scale(.97) !important; }
button:disabled { opacity: .5 !important; cursor: not-allowed !important; }

/* FORCE ALL INPUTS & TEXTAREAS (Fixes the invisible text bug everywhere) */
input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), select, textarea {
  width: 100% !important;
  background: #f8faf9 !important;
  color: var(--cp-ink) !important;
  border: 1.5px solid var(--cp-line) !important;
  border-radius: 14px !important;
  padding: 13px 14px !important;
  font: inherit !important;
  outline: none !important;
  -webkit-text-fill-color: var(--cp-ink) !important;
  box-sizing: border-box !important;
}
input::placeholder, textarea::placeholder { color: #93a29b !important; -webkit-text-fill-color: #93a29b !important; }
input:focus, select:focus, textarea:focus {
  border-color: var(--cp-g) !important;
  background: #fff !important;
  box-shadow: 0 0 0 3px rgba(18,147,90,.15) !important;
}

/* FORCE LABELS */
label { display: block !important; font-weight: 600 !important; color: #3e4f47 !important; margin: 10px 0 6px !important; font-size: 14px !important; }
input[type=checkbox], input[type=radio] { accent-color: var(--cp-g) !important; width: 20px !important; height: 20px !important; }

/* FORCE CARDS (Targets ANY div with 'card' or 'rounded' in the class name) */
div[class*="card" i], div[class*="rounded-xl"], div[class*="rounded-2xl"] {
  background: var(--cp-card) !important; 
  border-radius: var(--cp-r) !important; 
  box-shadow: var(--cp-shadow) !important;
  border: 1px solid rgba(10,61,43,0.04) !important;
}
html.dark div[class*="card" i], html.dark div[class*="rounded-xl"], html.dark div[class*="rounded-2xl"] {
  background: #17211c !important;
  border: 1px solid rgba(255,255,255,0.05) !important;
}

/* FORCE TABLES */
table { width: 100% !important; border-collapse: collapse !important; background: var(--cp-card) !important; border-radius: var(--cp-r) !important; overflow: hidden !important; }
th { font-size: 11px !important; letter-spacing: .1em !important; text-transform: uppercase !important; color: var(--cp-mute) !important; text-align: left !important; padding: 10px 14px !important; background: #f8faf9 !important; }
td { padding: 12px 14px !important; border-top: 1px solid var(--cp-line) !important; }
html.dark th { background: #0d1511 !important; }

/* FORCE DIALOGS & SHEETS */
[role=dialog] { background: var(--cp-card) !important; color: var(--cp-ink) !important; border-radius: 24px !important; }

/* PREVENT BOTTOM NAV OVERLAP */
nav[class*="bottom" i], [class*="tabbar" i], [class*="bottom-nav" i], [class*="floating" i] { 
  z-index: var(--cp-nav-z) !important; 
  background: var(--cp-card) !important; 
  border-radius: 50px !important; 
  box-shadow: 0 8px 30px rgba(0,0,0,.12) !important;
  border: 1px solid var(--cp-line) !important;
}
html.dark nav[class*="bottom" i] { background: #17211c !important; border-color: #26332c !important; }

main, #root>div { scroll-padding-bottom: var(--cp-nav-h) !important; }

/* UTILITIES */
.cp-page { padding:14px 16px calc(var(--cp-nav-h) + env(safe-area-inset-bottom,0px) + 16px) !important; max-width:760px !important; margin:0 auto !important; }
.cp-title { display:flex !important; align-items:center !important; gap:10px !important; margin:6px 0 14px !important; }
.cp-title h1 { margin:0 !important; font-size:22px !important; }
.cp-title small { display:block !important; color:var(--cp-mute) !important; font-weight:400 !important; }
.cp-card { background:var(--cp-card) !important; border-radius:var(--cp-r) !important; box-shadow:var(--cp-shadow) !important; padding:16px !important; margin-bottom:12px !important; }
.cp-card.flush { padding:0 !important; overflow:hidden !important; }
.cp-btn { display:inline-flex !important; align-items:center !important; justify-content:center !important; gap:8px !important; border:0 !important; border-radius:14px !important; padding:12px 18px !important; font-weight:700 !important; background:var(--cp-g) !important; color:#fff !important; }
.cp-btn.dark { background:var(--cp-gd) !important; }
.cp-btn.ghost { background:transparent !important; color:var(--cp-g) !important; border:1.5px solid var(--cp-g) !important; }
.cp-btn.soft { background:#eaf6ef !important; color:var(--cp-g) !important; }
.cp-btn.danger { background:#fdecec !important; color:#d92d33 !important; }
.cp-btn.block { width:100% !important; }
.cp-row { display:flex !important; align-items:center !important; gap:12px !important; padding:13px 14px !important; background:#fff !important; border:0 !important; width:100% !important; text-align:left !important; color:var(--cp-ink) !important; font-weight:600 !important; }
.cp-row+.cp-row { border-top:1px solid var(--cp-line) !important; }
html.dark .cp-row { background: #17211c !important; }
.cp-ico { width:38px !important; height:38px !important; border-radius:12px !important; background:#eaf6ef !important; color:var(--cp-g) !important; display:grid !important; place-items:center !important; flex:none !important; }
.cp-tabs { display:flex !important; gap:8px !important; overflow-x:auto !important; padding:2px 0 10px !important; scrollbar-width:none !important; }
.cp-tabs::-webkit-scrollbar { display:none !important; }
.cp-tab { flex:none !important; padding:9px 16px !important; border-radius:20px !important; border:1px solid var(--cp-line) !important; background:#fff !important; color:#44544c !important; font-weight:600 !important; }
.cp-tab.on { background:var(--cp-gd) !important; color:#fff !important; border-color:var(--cp-gd) !important; }
.cp-empty { text-align:center !important; color:var(--cp-mute) !important; padding:36px 20px !important; }
.cp-empty b { display:block !important; color:var(--cp-ink) !important; font-size:16px !important; margin-bottom:4px !important; }
.cp-badge { display:inline-block !important; background:#eaf6ef !important; color:var(--cp-g) !important; border-radius:12px !important; padding:3px 10px !important; font-size:12px !important; font-weight:700 !important; }
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
