import { X, Check } from 'lucide-react';
import { CHAT_THEME_LIST, ChatThemeKey, ChatTheme } from '../lib/chatThemes';

type Props = {
  value: ChatThemeKey;
  onChange: (k: ChatThemeKey) => void;
  onClose: () => void;
};

export default function ChatThemePicker({ value, onChange, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up"
      >
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[13px] font-bold text-navy dark:text-white">Chat theme</p>
          <button onClick={onClose} className="cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {CHAT_THEME_LIST.map((t: ChatTheme) => (
            <button
              key={t.key}
              onClick={() => { onChange(t.key); onClose(); }}
              className={`p-3 rounded-xl border-2 flex flex-col items-start gap-2 cursor-pointer ${
                value === t.key ? 'border-accent' : 'border-gray-200 dark:border-darkline'
              }`}
            >
              <div className="flex gap-1">
                <div className="w-6 h-6 rounded-full" style={{ background: t.accent }} />
                <div className="w-6 h-6 rounded-full bg-white dark:bg-darkcard border border-gray-200" />
              </div>
              <div className="flex items-center gap-1">
                <p className="text-[11px] font-bold text-navy dark:text-white">{t.label}</p>
                {value === t.key && <Check size={12} className="text-accent" />}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
