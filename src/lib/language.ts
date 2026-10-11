import { useState, useEffect } from 'react';

const LANG_KEY = 'cenpaya_lang';

export type Lang = 'en' | 'fr';

export function getLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  return stored === 'fr' ? 'fr' : 'en';
}

export function setLang(lang: Lang) {
  localStorage.setItem(LANG_KEY, lang);
  window.dispatchEvent(new CustomEvent('cenpaya-lang-change', { detail: lang }));
}

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(getLang());

  useEffect(() => {
    const handler = (e: any) => setLangState(e.detail);
    window.addEventListener('cenpaya-lang-change', handler);
    return () => window.removeEventListener('cenpaya-lang-change', handler);
  }, []);

  return [lang, setLang];
}
