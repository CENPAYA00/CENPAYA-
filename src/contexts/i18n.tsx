import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, TranslationKey } from '../lib/translations';

type Lang = 'en' | 'fr';

type I18nContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = 'cenpaya_lang';

function getInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'en') return stored;
    const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
    return nav.startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  };

  const toggleLang = () => setLang(lang === 'en' ? 'fr' : 'en');

  // Update HTML tag for accessibility
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key: TranslationKey, vars?: Record<string, string | number>) => {
    const dict = translations[lang] || translations.en;
    let str = (dict as any)[key] ?? (translations.en as any)[key] ?? key;
    
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return str;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
