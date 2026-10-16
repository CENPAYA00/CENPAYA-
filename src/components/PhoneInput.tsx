import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Check, Phone } from 'lucide-react';

export type PhoneCountry = { code: string; name: string; prefix: string; flag?: string };

type Props = {
  value: string;              // digits only, no prefix
  onChange: (v: string) => void;
  countryCode: string;        // 'CM'
  onCountryChange: (code: string) => void;
  countries: PhoneCountry[];
  label?: string;
  placeholder?: string;
};

export default function PhoneInput({
  value, onChange, countryCode, onCountryChange, countries,
  label, placeholder = '6XX XXX XXX',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = countries.find(c => c.code === countryCode);
  const filtered = search.trim()
    ? countries.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.prefix.includes(search))
    : countries;

  return (
    <div ref={ref} className="relative">
      {label && <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">{label}</label>}

      <div className="flex gap-2">
        {/* Country code dropdown trigger */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border bg-white dark:bg-darkcard shrink-0 cursor-pointer ${
            open ? 'border-accent ring-1 ring-accent' : 'border-gray-200 dark:border-darkline'
          }`}
        >
          <span className="text-[12px] font-bold text-navy dark:text-white">
            {selected?.flag} {selected?.prefix || '+237'}
          </span>
          <ChevronDown size={12} className="text-gray-400" />
        </button>

        {/* Number input */}
        <input
          type="tel"
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
          placeholder={placeholder}
          className="flex-1 p-2.5 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px]"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-white dark:bg-darkcard border border-gray-200 dark:border-darkline rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-darkline">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search country..."
                className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-lg outline-none focus:border-accent"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="p-3 text-[10px] text-gray-500 text-center">No country found</p>
            )}
            {filtered.map(c => {
              const sel = c.code === countryCode;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { onCountryChange(c.code); setOpen(false); setSearch(''); }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 border-b border-gray-50 dark:border-darkline last:border-b-0 cursor-pointer ${
                    sel ? 'bg-accent/10' : 'hover:bg-gray-50 dark:hover:bg-darkbg'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px]">{c.flag}</span>
                    <span className={`text-[11px] truncate ${sel ? 'text-accent font-bold' : 'text-navy dark:text-white font-medium'}`}>
                      {c.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono shrink-0">{c.prefix}</span>
                  {sel && <Check size={12} className="text-accent shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
