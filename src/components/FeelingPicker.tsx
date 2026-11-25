import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { FEELINGS, ACTIVITIES, FeelingOption } from '../lib/feelingOptions';

type Props = {
  onClose: () => void;
  onPick: (kind: 'feeling' | 'activity', option: FeelingOption) => void;
};

export default function FeelingPicker({ onClose, onPick }: Props) {
  const [tab, setTab] = useState<'feeling' | 'activity'>('feeling');
  const [search, setSearch] = useState('');

  const list = tab === 'feeling' ? FEELINGS : ACTIVITIES;
  const filtered = search.trim()
    ? list.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : list;

  return (
    <div className="fixed inset-0 z-[210] bg-black/50 flex items-end" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-h-[80vh] bg-white dark:bg-darkcard rounded-t-2xl flex flex-col animate-slide-up"
      >
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[13px] font-bold text-navy dark:text-white">
            {tab === 'feeling' ? 'How are you feeling?' : 'What are you doing?'}
          </p>
          <button onClick={onClose} className="cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-gray-100 dark:border-darkline">
          <button
            onClick={() => setTab('feeling')}
            className={`flex-1 py-2.5 text-[12px] font-bold cursor-pointer ${
              tab === 'feeling'
                ? 'text-accent border-b-2 border-accent'
                : 'text-gray-500 border-transparent'
            }`}
          >
            Feeling
          </button>
          <button
            onClick={() => setTab('activity')}
            className={`flex-1 py-2.5 text-[12px] font-bold cursor-pointer ${
              tab === 'activity'
                ? 'text-accent border-b-2 border-accent'
                : 'text-gray-500 border-transparent'
            }`}
          >
            Activity
          </button>
        </div>

        <div className="p-3 border-b border-gray-100 dark:border-darkline">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="p-6 text-center text-[11px] text-gray-500">No results.</p>
          )}
          {filtered.map(o => (
            <button
              key={o.label}
              onClick={() => onPick(tab, o)}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-darkline last:border-b-0 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-darkbg"
            >
              <span className="text-[22px] shrink-0">{o.emoji}</span>
              <span className="text-[13px] font-medium text-navy dark:text-white">
                {tab === 'activity' ? `${o.label}...` : o.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
