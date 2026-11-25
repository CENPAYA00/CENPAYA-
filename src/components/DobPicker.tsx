import { useState } from 'react';
import { Check } from 'lucide-react';

type Props = {
  value: string;            // YYYY-MM-DD or ''
  onChange: (v: string) => void;
  onConfirm?: () => void;
  error?: string;
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function DobPicker({ value, onChange, onConfirm, error }: Props) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  const parseValue = () => {
    if (!value) return { m: '', d: '', y: '' };
    const [y, m, d] = value.split('-');
    return { m: m ? String(parseInt(m, 10)) : '', d: d ? String(parseInt(d, 10)) : '', y };
  };

  const initial = parseValue();
  const [month, setMonth] = useState(initial.m);
  const [day, setDay] = useState(initial.d);
  const [year, setYear] = useState(initial.y);
  const [active, setActive] = useState<'month' | 'day' | 'year'>('year');

  const emit = (m: string, d: string, y: string) => {
    if (m && d && y) {
      const mm = String(parseInt(m, 10)).padStart(2, '0');
      const dd = String(parseInt(d, 10)).padStart(2, '0');
      onChange(`${y}-${mm}-${dd}`);
    }
  };

  const pickMonth = (idx: number) => {
    const m = String(idx + 1);
    setMonth(m);
    emit(m, day, year);
    setActive('day');
  };
  const pickDay = (d: number) => {
    const dd = String(d);
    setDay(dd);
    emit(month, dd, year);
    if (month && year) setActive('year');
  };
  const pickYear = (y: number) => {
    const yy = String(y);
    setYear(yy);
    emit(month, day, yy);
  };

  const daysInMonth = month && year
    ? new Date(parseInt(year), parseInt(month), 0).getDate()
    : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const calcAge = (): number | null => {
    if (!month || !day || !year) return null;
    const b = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    const m = t.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
    return a;
  };

  const age = calcAge();

  return (
    <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm border border-gray-100 dark:border-darkline overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand to-brand-dark px-4 py-3 text-white">
        <p className="text-[10px] font-bold text-accent-light tracking-widest uppercase">
          Confirm your identity
        </p>
      </div>

      {/* 3-card selector */}
      <div className="p-4">
        <div className="flex items-center gap-2 justify-center mb-4">
          <Card
            label="Month"
            value={month ? MONTHS[parseInt(month, 10) - 1] : '--'}
            active={active === 'month'}
            onClick={() => setActive('month')}
          />
          <span className="text-gray-300 text-lg font-bold">/</span>
          <Card
            label="Day"
            value={day || '--'}
            active={active === 'day'}
            onClick={() => setActive('day')}
          />
          <span className="text-gray-300 text-lg font-bold">/</span>
          <Card
            label="Year"
            value={year || '----'}
            active={active === 'year'}
            onClick={() => setActive('year')}
          />
        </div>

        {/* Selected display */}
        {month && day && year && (
          <p className="text-center text-[11px] text-gray-500 mb-3">
            Selected: <span className="text-accent font-bold">
              {MONTHS[parseInt(month, 10) - 1]} {String(parseInt(day, 10)).padStart(2, '0')}, {year}
            </span>
            {age !== null && (
              <span className="text-gray-400"> · {age} Yrs</span>
            )}
          </p>
        )}

        {/* Grid */}
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
          Select {active === 'month' ? 'Month' : active === 'day' ? 'Day' : 'Year'}
        </p>

        <div className="max-h-56 overflow-y-auto">
          <div className={`grid gap-1.5 ${active === 'month' ? 'grid-cols-4' : active === 'day' ? 'grid-cols-7' : 'grid-cols-4'}`}>
            {active === 'month' && MONTHS.map((m, i) => {
              const val = String(i + 1);
              const sel = month === val;
              return (
                <button
                  key={m}
                  onClick={() => pickMonth(i)}
                  className={`py-2.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                    sel ? 'bg-accent text-white' : 'bg-gray-100 dark:bg-darkbg text-navy dark:text-white hover:bg-accent/10'
                  }`}
                >
                  {m}
                </button>
              );
            })}
            {active === 'day' && days.map(d => {
              const val = String(d);
              const sel = day === val;
              return (
                <button
                  key={d}
                  onClick={() => pickDay(d)}
                  className={`py-2.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                    sel ? 'bg-accent text-white' : 'bg-gray-100 dark:bg-darkbg text-navy dark:text-white hover:bg-accent/10'
                  }`}
                >
                  {String(d).padStart(2, '0')}
                </button>
              );
            })}
            {active === 'year' && years.map(y => {
              const val = String(y);
              const sel = year === val;
              return (
                <button
                  key={y}
                  onClick={() => pickYear(y)}
                  className={`py-2.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                    sel ? 'bg-accent text-white' : 'bg-gray-100 dark:bg-darkbg text-navy dark:text-white hover:bg-accent/10'
                  }`}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confirm */}
      {onConfirm && (
        <div className="p-4 pt-0">
          <button
            onClick={onConfirm}
            disabled={!month || !day || !year}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Check size={14} /> Confirm date of birth
          </button>
        </div>
      )}

      {error && (
        <div className="px-4 pb-4">
          <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-2 rounded-lg">{error}</div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 rounded-xl border-2 cursor-pointer transition-all ${
        active
          ? 'border-accent bg-accent/5 scale-105'
          : 'border-gray-200 dark:border-darkline'
      }`}
    >
      <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{label}</p>
      <p className="text-[16px] font-black text-navy dark:text-white mt-0.5">{value}</p>
    </button>
  );
        }
