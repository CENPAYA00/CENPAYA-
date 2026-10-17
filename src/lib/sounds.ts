/* src/lib/sounds.ts */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC() as AudioContext;
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

type Tone = {
  freq: number;
  dur: number;
  type?: OscillatorType;
  delay?: number;
  gain?: number;
  glideTo?: number;
  attack?: number;
  release?: number;
};

type Preset = { layers: Tone[] };

function playTone(t: Tone, masterVolume: number): void {
  const audio = getCtx();
  if (!audio) return;

  const now = audio.currentTime + (t.delay || 0);
  const dur = t.dur;
  const attack = t.attack ?? 0.006;
  const release = t.release ?? dur * 0.85;
  const peak = masterVolume * (t.gain ?? 1);
  if (peak <= 0) return;

  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = t.type || 'sine';
  osc.frequency.setValueAtTime(t.freq, now);
  if (t.glideTo) {
    osc.frequency.exponentialRampToValueAtTime(t.glideTo, now + dur);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + attack);
  gain.gain.setValueAtTime(Math.max(peak, 0.0002), now + dur - release);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

function harmony(base: Tone, freqMultiplier: number, gainMultiplier: number): Tone {
  return {
    ...base,
    freq: base.freq * freqMultiplier,
    gain: (base.gain ?? 1) * gainMultiplier,
  };
}

// CHANGED: retuned presets (same shape as before)
const PRESETS = {
  tap: {
    layers: [
      { freq: 660, dur: 0.045, type: 'sine', gain: 0.35 },
      { freq: 1320, dur: 0.025, type: 'sine', gain: 0.08, delay: 0.004 },
    ],
  },
  message_sent: {
    layers: [
      { freq: 740, dur: 0.07, type: 'sine', gain: 0.55, glideTo: 880, attack: 0.004 },
      { freq: 1108, dur: 0.05, type: 'sine', gain: 0.14, delay: 0.02 },
    ],
  },
  message_received: {
    layers: [
      { freq: 587, dur: 0.16, type: 'sine', gain: 0.7, attack: 0.005, release: 0.14 },
      { freq: 880, dur: 0.14, type: 'sine', gain: 0.45, delay: 0.08, release: 0.12 },
      { freq: 1174, dur: 0.12, type: 'sine', gain: 0.16, delay: 0.08 },
      { freq: 1760, dur: 0.22, type: 'sine', gain: 0.06, delay: 0.08, release: 0.2 },
    ],
  },
  notification_received: {
    layers: [
      { freq: 523, dur: 0.18, type: 'sine', gain: 0.55, attack: 0.01, release: 0.16 },
      { freq: 784, dur: 0.16, type: 'sine', gain: 0.42, delay: 0.06, attack: 0.008, release: 0.14 },
      { freq: 1046, dur: 0.14, type: 'sine', gain: 0.14, delay: 0.06 },
    ],
  },
  like: {
    layers: [
      { freq: 780, dur: 0.06, type: 'sine', gain: 0.75, glideTo: 1180, attack: 0.003 },
      { freq: 1560, dur: 0.04, type: 'triangle', gain: 0.22, delay: 0.008 },
      { freq: 2340, dur: 0.03, type: 'sine', gain: 0.08, delay: 0.012 },
    ],
  },
  comment: {
    layers: [
      { freq: 620, dur: 0.055, type: 'sine', gain: 0.65, attack: 0.004 },
      { freq: 930, dur: 0.04, type: 'triangle', gain: 0.18, delay: 0.01 },
    ],
  },
  share: {
    layers: [
      { freq: 700, dur: 0.08, type: 'sine', gain: 0.7, glideTo: 880 },
      { freq: 1050, dur: 0.06, type: 'sine', gain: 0.24, delay: 0.05 },
    ],
  },
  post_created: {
    layers: [
      { freq: 523, dur: 0.11, type: 'sine', gain: 0.75, attack: 0.006 },
      { freq: 659, dur: 0.11, type: 'sine', gain: 0.6, delay: 0.09 },
      { freq: 784, dur: 0.16, type: 'sine', gain: 0.55, delay: 0.18, release: 0.14 },
      { freq: 1568, dur: 0.12, type: 'sine', gain: 0.14, delay: 0.18 },
    ],
  },
  success: {
    layers: [
      { freq: 587, dur: 0.11, type: 'sine', gain: 0.8, attack: 0.006 },
      { freq: 784, dur: 0.13, type: 'sine', gain: 0.62, delay: 0.09 },
      { freq: 1174, dur: 0.18, type: 'sine', gain: 0.36, delay: 0.18, release: 0.15 },
    ],
  },
  error: {
    layers: [
      { freq: 220, dur: 0.16, type: 'sine', gain: 0.75, attack: 0.005, release: 0.14 },
      { freq: 165, dur: 0.22, type: 'sine', gain: 0.7, delay: 0.13, release: 0.2 },
    ],
  },
  search: {
    layers: [
      { freq: 880, dur: 0.04, type: 'sine', gain: 0.45, attack: 0.003 },
      { freq: 1320, dur: 0.03, type: 'sine', gain: 0.12, delay: 0.005 },
    ],
  },
};

// ADDED: the missing export
export type SoundName = keyof typeof PRESETS;

export function playSound(name: SoundName, masterVolume: number = 0.14): void {
  const preset = PRESETS[name];
  if (!preset) return;
  preset.layers.forEach((layer) => playTone(layer, masterVolume));
}

// silence unused warnings — `harmony` is part of the public API surface
void harmony;
