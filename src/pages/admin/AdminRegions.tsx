import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Globe, X } from 'lucide-react';

export default function AdminRegions() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('regional_market_configurations')
      .select('*')
      .order('country_iso');
    setConfigs(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleOperational = async (config: any) => {
    await supabase.rpc('admin_update_region', {
      p_country_iso: config.country_iso,
      p_is_operational: !config.is_operational,
    });
    load();
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-2xl font-bold text-navy dark:text-white">🌍 Regional Markets</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Countries and their fee rules.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-accent text-white text-[11px] font-bold px-3 py-2 rounded-lg flex items-center gap-1"
        >
          <Plus size={12} /> Add country
        </button>
      </div>

      {configs.map(c => (
        <div key={c.country_iso} className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm mb-3">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="font-bold text-navy dark:text-white text-lg">{c.country_iso}</p>
              <p className="text-xs text-gray-500">Currency: {c.currency_code}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleOperational(c)}
                className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                  c.is_operational ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {c.is_operational ? 'Operational' : 'Offline'}
              </button>
              <button
                onClick={() => setEditing(c)}
                className="text-[10px] font-bold text-accent"
              >
                Edit
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
              <p className="text-gray-500">Base Fee</p>
              <p className="font-bold text-navy dark:text-white">{c.base_marketplace_fee_pct}%</p>
            </div>
            <div className="bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
              <p className="text-gray-500">Premium Fee</p>
              <p className="font-bold text-accent">{c.premium_subscriber_fee_pct}%</p>
            </div>
            <div className="bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
              <p className="text-gray-500">Withdrawal</p>
              <p className="font-bold text-navy dark:text-white">{c.withdrawal_fee_pct}%</p>
            </div>
          </div>
        </div>
      ))}

      {showAdd && (
        <CountryEditor
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
      {editing && (
        <CountryEditor
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CountryEditor({
  existing, onClose, onSaved,
}: { existing?: any; onClose: () => void; onSaved: () => void }) {
  const [country, setCountry] = useState(existing?.country_iso || '');
  const [currency, setCurrency] = useState(existing?.currency_code || 'XAF');
  const [baseFee, setBaseFee] = useState(String(existing?.base_marketplace_fee_pct ?? 8));
  const [premiumFee, setPremiumFee] = useState(String(existing?.premium_subscriber_fee_pct ?? 4));
  const [withdrawalFee, setWithdrawalFee] = useState(String(existing?.withdrawal_fee_pct ?? 2));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    if (!country || country.trim().length !== 2) return setErr('Country code must be 2 letters (e.g. CM).');

    setSaving(true);
    if (existing) {
      const { error } = await supabase.rpc('admin_update_region', {
        p_country_iso: existing.country_iso,
        p_base_fee_pct: Number(baseFee),
        p_premium_fee_pct: Number(premiumFee),
        p_withdrawal_fee_pct: Number(withdrawalFee),
      });
      if (error) { setErr(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.rpc('admin_add_country', {
        p_country_iso: country.trim().toUpperCase(),
        p_currency_code: currency.trim().toUpperCase(),
        p_base_fee_pct: Number(baseFee),
        p_premium_fee_pct: Number(premiumFee),
        p_withdrawal_fee_pct: Number(withdrawalFee),
      });
      if (error) { setErr(error.message); setSaving(false); return; }
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
          <p className="text-[13px] font-bold text-navy dark:text-white">
            {existing ? `Edit ${existing.country_iso}` : 'Add country'}
          </p>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-3 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Country code (ISO 2)</label>
            <input
              value={country}
              onChange={e => setCountry(e.target.value.toUpperCase().slice(0, 2))}
              disabled={!!existing}
              placeholder="CM"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Currency</label>
            <input
              value={currency}
              onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              disabled={!!existing}
              placeholder="XAF"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Base %</label>
              <input
                type="number"
                value={baseFee}
                onChange={e => setBaseFee(e.target.value)}
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Premium %</label>
              <input
                type="number"
                value={premiumFee}
                onChange={e => setPremiumFee(e.target.value)}
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Withdraw %</label>
              <input
                type="number"
                value={withdrawalFee}
                onChange={e => setWithdrawalFee(e.target.value)}
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
              />
            </div>
          </div>

          {err && <p className="text-[11px] text-red-600">{err}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
    }
