import { useEffect, useState } from 'react';
import { Zap, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Tier = { id: number; price: number; duration_days: number; scope: string; label: string; description: string };

export function InlineBoostBar({ 
  itemId, kind, isOwner, onSelectPlan 
}: { 
  itemId: string; 
  kind: string; 
  isOwner: boolean; 
  onSelectPlan: (plan: Tier) => void; 
}) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<Tier[]>([]);
  const [elig, setElig] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    setLoading(true);
    Promise.all([
      supabase.rpc('list_boost_tiers'),
      supabase.rpc('get_boost_eligibility')
    ]).then(([t, e]) => {
      setPlans(t.data || []);
      setElig(e.data);
      setLoading(false);
    });
  }, [isOwner]);

  if (!isOwner || loading || plans.length === 0) return null;

  const hasFree = elig?.is_member && elig?.free_boosts_remaining > 0;
  const lowestPrice = Math.min(...plans.map(p => p.price));

  return (
    <div className="mt-3" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-[#14a465] to-[#0a3d2b] text-white font-bold text-[13px] shadow-sm active:scale-[0.98] transition-transform"
      >
        <span className="flex items-center gap-2"><Zap size={16} /> Boost this {kind}</span>
        <span className="text-[11px] font-medium opacity-90">
          {hasFree ? 'FREE' : `from ${lowestPrice.toLocaleString()} XAF`} {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2 animate-slide-up">
          {hasFree && (
            <div className="flex items-center gap-2 p-2.5 bg-[#eaf6ef] dark:bg-[#12935a]/10 rounded-xl text-[#0a3d2b] dark:text-white text-[11px] font-semibold border border-[#12935a]/20">
              <Sparkles size={14} className="text-[#12935a]" /> 
              {elig.free_boosts_remaining} of 2 free tier-1 boosts remaining
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-2">
            {plans.map(p => {
              const isFree = hasFree && p.id === 1;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectPlan(p)}
                  className={`relative text-left p-3 rounded-xl border-2 transition-all active:scale-95 ${
                    isFree 
                      ? 'border-[#12935a] bg-[#f1faf5] dark:bg-[#12935a]/10' 
                      : 'border-transparent bg-white dark:bg-darkcard shadow-sm hover:border-[#12935a]/50'
                  }`}
                >
                  {isFree && <span className="absolute top-2 right-2 bg-[#12935a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded">FREE</span>}
                  
                  <p className="text-[10px] font-bold text-mute uppercase tracking-wider">{p.scope}</p>
                  <p className="text-[16px] font-black text-[#0a3d2b] dark:text-white mt-0.5">
                    {p.price.toLocaleString()} <span className="text-[10px] text-mute font-semibold">XAF</span>
                  </p>
                  <p className="text-[12px] font-semibold text-navy dark:text-gray-200 mt-0.5">{p.label}</p>
                  <p className="text-[10px] text-mute">{p.duration_days} days</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
      }
