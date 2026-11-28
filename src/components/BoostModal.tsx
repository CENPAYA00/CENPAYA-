import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { d1Request } from '../lib/d1Api';
import { getCachedUser } from '../lib/cache';

type Tier = { id: number; price: number; duration_days: number; scope: string; label: string; description: string };

export default function BoostModal({ 
  isOpen, onClose, targetType, targetId, targetTitle, initialPlanId
}: { 
  isOpen: boolean; onClose: () => void; targetType: 'listing' | 'post'; targetId: string; targetTitle: string; initialPlanId?: number;
}) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [elig, setElig] = useState<any>(null);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [tiersRes, eligRes] = await Promise.all([
          supabase.rpc('list_boost_tiers'),
          supabase.rpc('get_boost_eligibility')
        ]);
        if (tiersRes.error || eligRes.error) {
          throw new Error(tiersRes.error?.message || eligRes.error?.message || 'Boost plans are unavailable.');
        }
        if (!active) return;
        const t = tiersRes.data || [];
        setTiers(t);
        setElig(eligRes.data);
        if (initialPlanId) {
          const match = t.find((x: any) => x.id === initialPlanId);
          if (match) setSelectedTier(match);
        }
      } catch (error) {
        if (!active) return;
        setTiers([]);
        setElig(null);
        setSelectedTier(null);
        setLoadError(error instanceof Error ? error.message : 'Boost plans are temporarily unavailable.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [isOpen, initialPlanId]);

  const purchase = async (useFree: boolean) => {
    if (!selectedTier) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('purchase_boost', {
        p_target_type: targetType, p_target_id: targetId, p_tier_id: selectedTier.id, p_use_free_premium: useFree,
      });
      if (error || !data?.ok) {
        alert(error?.message || data?.error || 'Boost could not be completed.');
        return;
      }

      try {
        const me = await getCachedUser();
        if (me) {
          await d1Request('/api/notifications', { method: 'POST', body: JSON.stringify({
            kind: 'system', title: 'Boost activated',
            body: `${selectedTier.label} — ${targetType} boosted until ${new Date(data.until).toLocaleDateString()}`,
            link_url: `/${targetType}/${targetId}`,
          }) });
        }
      } catch (e) { console.warn(e); }

      alert(`Successfully boosted until ${new Date(data.until).toLocaleDateString()}`);
      onClose();
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Boost request failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const canUseFree = elig?.is_member && elig?.free_boosts_remaining > 0;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-[#eef2f0] dark:bg-darkbg rounded-t-3xl shadow-2xl animate-slide-up max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-darkline">
          <div>
            <h2 className="text-[20px] font-bold text-navy dark:text-white">Boost this {targetType}</h2>
            <p className="text-[13px] text-mute truncate max-w-[250px]">{targetTitle}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-200 dark:bg-darkline rounded-full cursor-pointer"><X size={20} /></button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading && <p className="text-center text-xs text-gray-500 py-6">Loading boost plans...</p>}
          {loadError && <p role="alert" className="text-[11px] text-red-600 bg-red-50 dark:bg-red-900/20 rounded-xl p-3 mb-4">{loadError}</p>}
          {!loading && !loadError && tiers.length === 0 && <p className="text-center text-xs text-gray-500 py-6">No boost plans are currently available.</p>}
          {elig?.is_member && (
            <div className="bg-[#eaf6ef] dark:bg-[#12935a]/10 border border-[#12935a]/20 rounded-[16px] p-4 mb-5 flex items-start gap-3">
              <Sparkles size={20} className="text-[#12935a] mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[14px] font-bold text-[#0a3d2b] dark:text-white">Premium free boosts</p>
                <p className="text-[13px] text-[#3e4f47] dark:text-gray-300 mt-0.5">{Number(elig.free_boosts_remaining) > 0 ? '1 of 1 free 3-day boost available this month. Unused boosts do not roll over.' : 'Your monthly free 3-day boost has been used'}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-6">
            {tiers.map(t => {
              const isFree = t.duration_days === 3 && canUseFree;
              const isSel = selectedTier?.id === t.id;
              return (
                <button key={t.id} onClick={() => setSelectedTier(t)}
                  className={`p-4 rounded-[20px] border-2 text-left transition-all ${isSel ? 'border-[#12935a] bg-[#f1faf5] dark:bg-[#12935a]/10 shadow-sm' : 'border-transparent bg-white dark:bg-darkcard shadow-sm'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-mute">{t.scope}</span>
                    {isFree && <span className="text-[10px] font-bold bg-[#12935a] text-white px-2 py-0.5 rounded-md">FREE</span>}
                  </div>
                  <p className="text-[18px] font-bold text-[#0a3d2b] dark:text-white">{t.price.toLocaleString()} <span className="text-[12px] font-semibold text-mute">XAF</span></p>
                  <p className="text-[13px] font-semibold text-navy dark:text-gray-200 mt-1">{t.label}</p>
                  <p className="text-[12px] text-mute mt-0.5">{t.duration_days} days</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-darkline pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
          {selectedTier && selectedTier.duration_days === 3 && canUseFree ? (
            <button onClick={() => purchase(true)} disabled={busy || loading || !!loadError || !selectedTier} className="w-full bg-[#12935a] text-white font-bold py-3.5 rounded-[14px] text-[15px] disabled:opacity-50">
              {busy ? 'Processing...' : 'Use free premium boost'}
            </button>
          ) : (
            <button onClick={() => purchase(false)} disabled={busy || loading || !!loadError || !selectedTier} className="w-full bg-[#12935a] text-white font-bold py-3.5 rounded-[14px] text-[15px] disabled:opacity-50">
              {busy ? 'Processing...' : selectedTier ? `Pay ${selectedTier.price.toLocaleString()} XAF from wallet` : 'Select a plan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
    }
