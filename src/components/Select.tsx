import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type SelectOption = { value: string; label: string; sub?: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  emptyText?: string;
};

export default function Select({
  value, onChange, options, placeholder = 'Select...', label, disabled, emptyText = 'No options',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = options.find(o => o.value === value);
  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative">
      {label && <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">{label}</label>}

      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full px-3 py-2.5 rounded-xl border bg-white dark:bg-darkcard text-left flex items-center justify-between gap-2 transition-colors
          ${open ? 'border-accent ring-1 ring-accent' : 'border-gray-200 dark:border-darkline'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`text-[12px] truncate ${selected ? 'text-navy dark:text-white font-medium' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-darkcard border border-gray-200 dark:border-darkline rounded-xl shadow-lg overflow-hidden animate-fade-in">
          {options.length > 8 && (
            <div className="p-2 border-b border-gray-100 dark:border-darkline">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1.5 text-[11px] bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-lg outline-none focus:border-accent"
                autoFocus
              />
            </div>
          )}

          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="p-3 text-[10px] text-gray-500 text-center">{emptyText}</p>
            )}
            {filtered.map(o => {
              const isSel = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 border-b border-gray-50 dark:border-darkline last:border-b-0
                    ${isSel ? 'bg-accent/10' : 'hover:bg-gray-50 dark:hover:bg-darkbg'}`}
                >
                  <div className="min-w-0">
                    <p className={`text-[11px] truncate ${isSel ? 'text-accent font-bold' : 'text-navy dark:text-white font-medium'}`}>
                      {o.label}
                    </p>
                    {o.sub && <p className="text-[9px] text-gray-500 truncate">{o.sub}</p>}
                  </div>
                  {isSel && <Check size={13} className="text-accent shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
            }
