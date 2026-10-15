import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { playSound, SoundName } from '../lib/sounds';
import { supabase } from '../lib/supabase';

type SoundContextValue = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
  play: (name: SoundName) => void;
};

const SoundContext = createContext<SoundContextValue | null>(null);
const STORAGE_KEY = 'cenpaya_sound';

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === '1';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  }, [enabled]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      try {
        await supabase.from('users').update({ sound_enabled: enabled }).eq('id', user.id);
      } catch {
        // column may not exist yet — ignore
      }
    })();
  }, [enabled]);

  const setEnabled = (v: boolean) => setEnabledState(v);
  const toggle = () => setEnabledState(p => !p);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabled) return;
      playSound(name);
    },
    [enabled]
  );

  return (
    <SoundContext.Provider value={{ enabled, setEnabled, toggle, play }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSound must be used inside <SoundProvider>');
  return ctx;
}
