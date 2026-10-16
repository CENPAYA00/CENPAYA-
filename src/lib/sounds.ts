let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Browsers suspend AudioContext until user gesture — resume it on demand
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

type Tone = {
  freq: number;
  dur: number;          // total duration in seconds
  type?: OscillatorType;
  delay?: number;       // start offset
  gain?: number;        // 0..1, defaults to 1
  glideTo?: number;     // optional frequency glide target (for "pop" effects)
  attack?: number;      // seconds, default 0.006 (5ms)
  release?: number;     // seconds, default = dur * 0.85
};

/**
 * Modern layered tone player.
 * - Smooth attack (default 5-8ms) → no click
 * - Exponential release → natural decay
 * - Multiple oscillators mixed → richer, less "beepy"
 */
function playTone(t: Tone, masterVolume: number) {
  const audio = getCtx();
  if (!audio) return;

  const now = audio.currentTime + (t.delay || 0);
  const dur = t.dur;
  const attack = t.attack ?? 0.006;
  const release = t.release ?? dur * 0.85;
  const peak = masterVolume * (t.gain ?? 1);

  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = t.type || 'sine';
  osc.frequency.setValueAtTime(t.freq, now);
  if (t.glideTo) {
    osc.frequency.exponentialRampToValueAtTime(t.glideTo, now + dur);
  }

  // Smooth envelope: attack → hold → exponential release
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.setValueAtTime(peak, now + dur - release);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** A harmony layer — quieter, usually 5th or octave above the base */
function harmony(base: Tone, freqMultiplier: number, gainMultiplier: number): Tone {
  return { ...base, freq: base.freq * freqMultiplier, gain: (base.gain ?? 1) * gainMultiplier };
}

type Preset = { layers: Tone[] };

/**
 * Modern, warm, layered tone library.
 * All timings/envelopes chosen to feel "current generation".
 */
const PRESETS: Record<string, Preset> = {
  // Soft tap — like Instagram / iOS
  tap: {
    layers: [
      { freq: 660, dur: 0.055, type: 'sine', gain: 0.9 },
      { freq: 1320, dur: 0.035, type: 'sine', gain: 0.25, delay: 0.004 },
    ],
  },

  // Message sent — muted, brief, upward
  message_sent: {
    layers: [
      { freq: 740, dur: 0.08, type: 'sine', gain: 0.85, glideTo: 880, attack: 0.004 },
      { freq: 1108, dur: 0.06, type: 'sine', gain: 0.2, delay: 0.02 },
    ],
  },

  // Message received — warm two-tone chime (like iMessage-lite)
  message_received: {
    layers: [
      { freq: 587, dur: 0.13, type: 'sine', gain: 0.9, attack: 0.005, release: 0.11 },
      { freq: 880, dur: 0.11, type: 'sine', gain: 0.55, delay: 0.07, release: 0.09 },
      { freq: 1174, dur: 0.09, type: 'sine', gain: 0.18, delay: 0.07 },
    ],
  },

  // Notification — soft, distant, no startle
  notification_received: {
    layers: [
      { freq: 523, dur: 0.16, type: 'sine', gain: 0.7, attack: 0.01, release: 0.14 },
      { freq: 784, dur: 0.14, type: 'sine', gain: 0.5, delay: 0.06, attack: 0.008, release: 0.12 },
      { freq: 1046, dur: 0.12, type: 'sine', gain: 0.15, delay: 0.06 },
    ],
  },

  // Like — quick, friendly pop
  like: {
    layers: [
      { freq: 780, dur: 0.07, type: 'sine', gain: 0.9, glideTo: 1040, attack: 0.003 },
      { freq: 1560, dur: 0.05, type: 'sine', gain: 0.2, delay: 0.01 },
    ],
  },

  // Comment — subtle tick
  comment: {
    layers: [
      { freq: 620, dur: 0.06, type: 'sine', gain: 0.8, attack: 0.004 },
      { freq: 930, dur: 0.04, type: 'sine', gain: 0.2, delay: 0.01 },
    ],
  },

  // Share — gentle two-note
  share: {
    layers: [
      { freq: 700, dur: 0.09, type: 'sine', gain: 0.85, glideTo: 880 },
      { freq: 1050, dur: 0.07, type: 'sine', gain: 0.3, delay: 0.05 },
    ],
  },

  // Post created — success chime (three warm tones)
  post_created: {
    layers: [
      { freq: 523, dur: 0.11, type: 'sine', gain: 0.85, attack: 0.006 },
      { freq: 659, dur: 0.11, type: 'sine', gain: 0.7, delay: 0.09 },
      { freq: 784, dur: 0.16, type: 'sine', gain: 0.6, delay: 0.18, release: 0.14 },
      { freq: 1568, dur: 0.12, type: 'sine', gain: 0.15, delay: 0.18 },
    ],
  },

  // Success — soft ascending confirmation
  success: {
    layers: [
      { freq: 587, dur: 0.11, type: 'sine', gain: 0.9, attack: 0.006 },
      { freq: 784, dur: 0.13, type: 'sine', gain: 0.7, delay: 0.09 },
      { freq: 1174, dur: 0.18, type: 'sine', gain: 0.4, delay: 0.18, release: 0.15 },
    ],
  },

  // Error — soft low double-thud (no harsh buzz)
  error: {
    layers: [
      { freq: 220, dur: 0.16, type: 'sine', gain: 0.9, attack: 0.005, release: 0.14 },
      { freq: 165, dur: 0.22, type: 'sine', gain: 0.85, delay: 0.13, release: 0.2 },
    ],
  },

  // Search — very short soft tick
  search: {
    layers: [
      { freq: 880, dur: 0.04, type: 'sine', gain: 0.6, attack: 0.003 },
      { freq: 1320, dur: 0.03, type: 'sine', gain: 0.15, delay: 0.005 },
    ],
  },
};

export type SoundName = keyof typeof PRESETS;

export function playSound(name: SoundName, masterVolume = 0.14) {
  const preset = PRESETS[name];
  if (!preset) return;
  preset.layers.forEach(layer => playTone(layer, masterVolume));
}
