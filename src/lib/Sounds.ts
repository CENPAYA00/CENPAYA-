let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

type ToneSpec = { freq: number; dur: number; type?: OscillatorType; delay?: number };

const TONES: Record<string, ToneSpec[]> = {
  message_received: [{ freq: 880, dur: 0.08, type: 'sine' }, { freq: 1320, dur: 0.08, type: 'sine', delay: 0.08 }],
  message_sent:     [{ freq: 660, dur: 0.06, type: 'sine' }],
  notification_received: [{ freq: 660, dur: 0.1, type: 'triangle' }, { freq: 990, dur: 0.12, type: 'triangle', delay: 0.1 }],
  tap:              [{ freq: 500, dur: 0.03, type: 'square' }],
  success:          [{ freq: 600, dur: 0.08 }, { freq: 900, dur: 0.08, delay: 0.08 }, { freq: 1200, dur: 0.1, delay: 0.16 }],
  error:            [{ freq: 400, dur: 0.12, type: 'sawtooth' }, { freq: 260, dur: 0.18, type: 'sawtooth', delay: 0.12 }],
};

export function playSound(name: keyof typeof TONES, volume = 0.15) {
  const audio = getCtx();
  if (!audio) return;
  const tones = TONES[name];
  if (!tones) return;

  const now = audio.currentTime;
  tones.forEach(t => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = t.type || 'sine';
    osc.frequency.setValueAtTime(t.freq, now + (t.delay || 0));
    gain.gain.setValueAtTime(volume, now + (t.delay || 0));
    gain.gain.exponentialRampToValueAtTime(0.001, now + (t.delay || 0) + t.dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + (t.delay || 0));
    osc.stop(now + (t.delay || 0) + t.dur);
  });
}

export type SoundName = keyof typeof TONES;
