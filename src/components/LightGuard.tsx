/* src/components/LightGuard.tsx */
import React, { useEffect } from "react";

const LIGHT = { bg: "#eef2f0", card: "#ffffff", ink: "#12261c", mute: "#6f8077", line: "#e6ece8", green: "#12935a" };

const LOCK_CSS = `
:root,:root[data-theme]{color-scheme:light only;--cp-bg:${LIGHT.bg};--cp-card:${LIGHT.card};--cp-ink:${LIGHT.ink};--cp-mute:${LIGHT.mute};--cp-line:${LIGHT.line};--cp-green:${LIGHT.green}}
@media (prefers-color-scheme:dark){:root,:root[data-theme]{color-scheme:light only;--cp-bg:${LIGHT.bg};--cp-card:${LIGHT.card};--cp-ink:${LIGHT.ink};--cp-mute:${LIGHT.mute};--cp-line:${LIGHT.line}}}
html,body{background:var(--cp-bg);color:var(--cp-ink)}
:where([data-surface]){background:var(--cp-card);color:var(--cp-ink)}
:where([data-surface]) :where(p,span,div,h1,h2,h3,h4,h5,h6,a,li,label,small,time,b,strong){color:inherit}
:where([data-surface]) :where(input,textarea,select){color:var(--cp-ink);background:#f8faf9;-webkit-text-fill-color:var(--cp-ink)}
img,video{background:#e9eeeb}
`;

export function lockLight(): void {
  const root = document.documentElement;
  root.style.colorScheme = "light";
  root.setAttribute("data-theme", "light");
  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!meta) { meta = document.createElement("meta"); meta.name = "color-scheme"; document.head.appendChild(meta); }
  meta.content = "light only";
  if (!document.getElementById("cp-light-lock")) {
    const s = document.createElement("style"); s.id = "cp-light-lock"; s.textContent = LOCK_CSS; document.head.appendChild(s);
  }
}

type RGB = [number, number, number];
const parse = (c: string): [number, number, number, number] | null => {
  const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p[3] ?? 1];
};
const lum = ([r, g, b]: RGB): number => {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: RGB, b: RGB): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

function solidBackground(el: Element): RGB | "complex" {
  let n: Element | null = el;
  while (n) {
    const cs = getComputedStyle(n);
    if (cs.backgroundImage !== "none") return "complex";
    const c = parse(cs.backgroundColor);
    if (c && c[3] > 0.9) return [c[0], c[1], c[2]];
    n = n.parentElement;
  }
  return hex(LIGHT.bg);
}
const hasOwnText = (el: Element): boolean => Array.from(el.childNodes).some((n) => n.nodeType === 3 && !!n.textContent?.trim());

function fix(el: HTMLElement): void {
  if (!hasOwnText(el) || el.closest("svg")) return;
  const cs = getComputedStyle(el);
  if (cs.visibility === "hidden" || cs.display === "none") return;
  const fg = parse(cs.color); if (!fg) return;
  const bg = solidBackground(el); if (bg === "complex") return;
  if (fg[3] < 0.2) {
    el.style.setProperty("color", lum(bg) > 0.5 ? LIGHT.ink : "#fff", "important"); return;
  }
  if (contrast([fg[0], fg[1], fg[2]], bg) < 3) {
    el.style.setProperty("color", lum(bg) > 0.5 ? LIGHT.ink : "#ffffff", "important");
    el.style.setProperty("-webkit-text-fill-color", lum(bg) > 0.5 ? LIGHT.ink : "#ffffff", "important");
  }
}

export function startContrastGuard(root: HTMLElement = document.body): () => void {
  const queue = new Set<Element>();
  let scheduled = false;
  const idle = (cb: () => void) => ("requestIdleCallback" in window ? (window as any).requestIdleCallback(cb, { timeout: 300 }) : setTimeout(cb, 60));
  const run = () => {
    scheduled = false;
    let n = 0;
    for (const el of queue) { queue.delete(el); if (el instanceof HTMLElement) fix(el); if (++n >= 150) break; }
    if (queue.size) { scheduled = true; idle(run); }
  };
  const add = (el: Element) => {
    queue.add(el); el.querySelectorAll("*").forEach((c) => queue.add(c));
    if (!scheduled) { scheduled = true; idle(run); }
  };
  add(root);
  const mo = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "childList") m.addedNodes.forEach((n) => n.nodeType === 1 && add(n as Element));
      else if (m.target instanceof Element && !queue.has(m.target)) { queue.add(m.target); if (!scheduled) { scheduled = true; idle(run); } }
    }
  });
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  return () => mo.disconnect();
}

export const LightGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    lockLight();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const relock = () => lockLight();
    mq.addEventListener("change", relock);
    const stop = startContrastGuard();
    return () => { mq.removeEventListener("change", relock); stop(); };
  }, []);
  return <>{children}</>;
};
