/* src/components/SoundToggle.tsx */
import { Volume2, VolumeX } from 'lucide-react';
import { useSound } from '../contexts/sound';
import { playSound } from '../lib/sounds'; // ADDED: ungated primitive for the confirm tone

export default function SoundToggle() {
  const { enabled, toggleEnabled, play } = useSound(); // CHANGED: toggle -> toggleEnabled

  const handleToggle = () => {
    toggleEnabled();
    // CHANGED: playSound bypasses the context's enabled-gate.
    // context.play() would no-op here because `enabled` hasn't
    // updated in this render yet.
    if (!enabled) playSound('tap');
  };

  return (
    <div className="p-3 flex items-center justify-between bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent">
          {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </div>
        <div>
          <p className="text-[12px] font-bold text-navy dark:text-white">Sound effects</p>
          <p className="text-[10px] text-gray-500">Play tones on likes, comments, messages</p>
        </div>
      </div>
      <button
        onClick={handleToggle}
        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
          enabled ? 'bg-accent' : 'bg-gray-300 dark:bg-darkline'
        }`}
        aria-label={enabled ? 'Disable sound' : 'Enable sound'}
        aria-pressed={enabled}
        role="switch"
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            enabled ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
