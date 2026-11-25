/* src/contexts/sound.tsx — SAMPLE, not final — paste yours and I'll match it */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { playSound, type SoundName } from '../lib/sounds';

type SoundContextValue = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggleEnabled: () => void;
  play: (name: SoundName, volume?: number) => void;
};

const SoundContext = createContext<SoundContextValue | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const v = localStorage.getItem('sound_enabled');
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  });

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem('sound_enabled', String(v));
    } catch {}
  };

  const toggleEnabled = () => setEnabled(!enabled);

  const play = (name: SoundName, volume?: number) => {
    if (!enabled) return;
    playSound(name, volume);
  };

  const value: SoundContextValue = { enabled, setEnabled, toggleEnabled, play };

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSound must be used inside SoundProvider');
  return ctx;
}

export type { SoundName };
