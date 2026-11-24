import { useEffect, useState } from 'react';
import { supabaseWorkerRequest } from '../../lib/supabaseWorkerApi';
import { Plus, X, Globe, Pencil } from 'lucide-react';

type Region = {
  country_iso: string;
  currency_code: string;
  base_marketplace_fee_pct: number;
  premium_subscriber_fee_pct: number;
  withdrawal_fee_pct: number;
  is_operational: boolean;
  fee_fixed_premium: number;
  fee_fixed_base: number;
};

export default function AdminRegions() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Region | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await supabaseWorkerRequest<{ data: Region[] }>('/api/v1/admin/regions');
      setRegions(result.data || []);
    } catch (err: any) {
      setError(err.message || 'Could not load regional settings.');
      setRegions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleOperational = async (region: Region) => {
    setError('');
    try {
      await supabaseWorkerRequest('/api/v1/admin/rpc/admin_update_region', {
        method: 'POST',
        body: JSON.stringify({ args: {
          p_country_iso: region.country_iso,
          p_base_fee_pct: Number(region.base_marketplace_fee_pct),
          p_premium_fee_pct: Number(region.premium_subscriber_fee_pct),
          p_withdrawal_fee_pct: Number(region.withdrawal_fee_pct),
          p_is_operational: !region.is_operational,
        } }),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not update country status.');
    }
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading regional settings...</div>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-2xl font-bold text-navy dark:text-white">🌍 Countries & fees</h2>
          <p className="text-[11px] text-gray-500">{regions.filter(r => r.is_operational).length} operational · {regions.length} configured</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-accent text-white text-[11px] font-bold px-3 py-2 rounded-lg flex items-center gap-1">
          <Plus size={12} /> Add country
        </button>
      </div>

      {error && <div role="alert" className="bg-red-50 text-red-700 rounded-lg p-3 text-[11px] mb-3">{error}</div>}

      {regions.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-xl p-6 text-center shadow-sm">
          <Globe size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[12px] text-gray-500">No regional fee configurations found.</p>
        </div>
      )}

      {regions.map(region => (
        <section key={region.country_iso} className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm mb-2">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[13px] font-bold text-navy dark:text-white">{region.country_iso}</p>
              <p className="text-[10px] text-gray-500">Settlement currency: {region.currency_code}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => void toggleOperational(region)} className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${region.is_operational ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-darkline text-gray-500'}`}>
                {region.is_operational ? 'Operational' : 'Paused'}
              </button>
              <button onClick={() => setEditing(region)} aria-label={`Edit ${region.country_iso}`} className="text-accent p-1.5">
                <Pencil size={14} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
              <p className="text-[9px] text-gray-500">Standard fee</p>
              <p className="text-[12px] font-bold text-navy dark:text-white">{Number(region.base_marketplace_fee_pct).toFixed(2)}%</p>
            </div>
            <div className="bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
              <p className="text-[9px] text-gray-500">Member fee</p>
              <p className="text-[12px] font-bold text-navy dark:text-white">{Number(region.premium_subscriber_fee_pct).toFixed(2)}%</p>
            </div>
            <div className="bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
              <p className="text-[9px] text-gray-500">Withdrawal</p>
              <p className="text-[12px] font-bold text-navy dark:text-white">{Number(region.withdrawal_fee_pct).toFixed(2)}%</p>
            </div>
          </div>
          <p className="text-[9px] text-gray-400 mt-2">Fixed fees: standard {Number(region.fee_fixed_base || 0)} · member {Number(region.fee_fixed_premium || 0)}</p>
        </section>
      ))}

      {showAdd && <RegionEditor onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); void load(); }} />}
      {editing && <RegionEditor existing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function RegionEditor({ existing, onClose, onSaved }: { existing?: Region; onClose: () => void; onSaved: () => void }) {
  const [countryIso, setCountryIso] = useState(existing?.country_iso || '');
  const [currency, setCurrency] = useState(existing?.currency_code || 'XAF');
  const [baseFee, setBaseFee] = useState(String(existing?.base_marketplace_fee_pct ?? 4));
  const [premiumFee, setPremiumFee] = useState(String(existing?.premium_subscriber_fee_pct ?? 2));
  const [withdrawalFee, setWithdrawalFee] = useState(String(existing?.withdrawal_fee_pct ?? 0));
  const [operational, setOperational] = useState(existing?.is_operational ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    const iso = countryIso.trim().toUpperCase();
    const code = currency.trim().toUpperCase();
    const base = Number(baseFee), premium = Number(premiumFee), withdrawal = Number(withdrawalFee);
    if (!/^[A-Z]{2}$/.test(iso) || !/^[A-Z]{3}$/.test(code)) return setError('Enter a valid two-letter country code and three-letter currency code.');
    if (![base,premium,withdrawal].every(v => Number.isFinite(v) && v >= 0 && v <= 100)) return setError('Fees must be between 0 and 100 percent.');
    setBusy(true);
    try {
      if (existing) {
        await supabaseWorkerRequest('/api/v1/admin/rpc/admin_update_region', {
          method: 'POST',
          body: JSON.stringify({ args: {
            p_country_iso: iso,
            p_base_fee_pct: base,
            p_premium_fee_pct: premium,
            p_withdrawal_fee_pct: withdrawal,
            p_is_operational: operational,
          } }),
        });
      } else {
        await supabaseWorkerRequest('/api/v1/admin/rpc/admin_add_country', {
          method: 'POST',
          body: JSON.stringify({ args: {
            p_country_iso: iso,
            p_currency_code: code,
            p_base_fee_pct: base,
            p_premium_fee_pct: premium,
            p_withdrawal_fee_pct: withdrawal,
          } }),
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not save regional settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
          <p className="text-[13px] font-bold text-navy dark:text-white">{existing ? `Edit ${existing.country_iso}` : 'Add country'}</p>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400">Country ISO
              <input value={countryIso} onChange={e => setCountryIso(e.target.value.toUpperCase().slice(0,2))} disabled={!!existing} placeholder="CM" className="mt-1 w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs disabled:opacity-60" />
            </label>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400">Currency
              <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase().slice(0,3))} disabled={!!existing} placeholder="XAF" className="mt-1 w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs disabled:opacity-60" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400">Standard fee %
              <input type="number" min="0" max="100" step="0.01" value={baseFee} onChange={e => setBaseFee(e.target.value)} className="mt-1 w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
            </label>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400">Member fee %
              <input type="number" min="0" max="100" step="0.01" value={premiumFee} onChange={e => setPremiumFee(e.target.value)} className="mt-1 w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
            </label>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400">Withdrawal %
              <input type="number" min="0" max="100" step="0.01" value={withdrawalFee} onChange={e => setWithdrawalFee(e.target.value)} className="mt-1 w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
            </label>
          </div>
          {existing && <label className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300"><input type="checkbox" checked={operational} onChange={e => setOperational(e.target.checked)} /> Country is operational</label>}
          {error && <p role="alert" className="text-[11px] text-red-600">{error}</p>}
          <button onClick={() => void save()} disabled={busy} className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50">{busy ? 'Saving...' : 'Save regional settings'}</button>
        </div>
      </div>
    </div>
  );
}
