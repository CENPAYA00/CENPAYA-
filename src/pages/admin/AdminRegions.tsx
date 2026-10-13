import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, Globe } from 'lucide-react';

export default function AdminRegions() {
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('supported_countries')
      .select('*')
      .order('is_active', { ascending: false })
      .order('name');
    setCountries(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (c: any) => {
    await supabase.from('supported_countries').update({ is_active: !c.is_active }).eq('code', c.code);
    load();
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-2xl font-bold text-navy dark:text-white">🌍 Regions</h2>
          <p className="text-[11px] text-gray-500">
            {countries.filter(c => c.is_active).length} active · {countries.length} total
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-accent text-white text-[11px] font-bold px-3 py-2 rounded-lg flex items-center gap-1"
        >
          <Plus size={12} /> Add country
        </button>
      </div>

      {countries.map(c => (
        <div key={c.code} className={`bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm mb-2 ${!c.is_active ? 'opacity-60' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[20px]">{c.flag_emoji || '🌐'}</span>
              <div>
                <p className="text-[12px] font-bold text-navy dark:text-white">{c.name}</p>
                <p className="text-[10px] text-gray-500">{c.code} · {c.phone_prefix} · {c.currency_code}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleActive(c)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                  c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-darkline text-gray-500'
                }`}
              >
                {c.is_active ? 'Active' : 'Off'}
              </button>
              <button
                onClick={() => setEditing(c)}
                className="text-[10px] font-bold text-accent"
              >
                Edit
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
              <p className="text-[9px] text-gray-500">1 {c.currency_code}</p>
              <p className="text-[11px] font-bold text-navy dark:text-white">{c.currency_value_in_xaf} XAF</p>
            </div>
            <div className="bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
              <p className="text-[9px] text-gray-500">Regions</p>
              <p className="text-[11px] font-bold text-navy dark:text-white">
                {Array.isArray(c.regions) ? c.regions.length : 0}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
              <p className="text-[9px] text-gray-500">Methods</p>
              <p className="text-[11px] font-bold text-navy dark:text-white">
                {Array.isArray(c.enabled_methods) ? c.enabled_methods.length : 0}
              </p>
            </div>
          </div>
        </div>
      ))}

      {showAdd && <CountryEditor onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} countries={countries} />}
      {editing && <CountryEditor existing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} countries={countries} />}
    </div>
  );
}

function CountryEditor({ existing, onClose, onSaved, countries }: any) {
  const [code, setCode] = useState(existing?.code || '');
  const [name, setName] = useState(existing?.name || '');
  const [phonePrefix, setPhonePrefix] = useState(existing?.phone_prefix || '+');
  const [currency, setCurrency] = useState(existing?.currency_code || 'XAF');
  const [currencyValue, setCurrencyValue] = useState(String(existing?.currency_value_in_xaf ?? 1));
  const [flag, setFlag] = useState(existing?.flag_emoji || '');
  const [methods, setMethods] = useState<string[]>(existing?.enabled_methods || ['mtn_momo','orange_money','airtel_money','moov_money']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const availableCountries = countries.filter((c: any) => !c.is_active && !existing);

  const pickExisting = (iso: string) => {
    const found = countries.find((x: any) => x.code === iso);
    if (!found) return;
    setCode(found.code);
    setName(found.name);
    setPhonePrefix(found.phone_prefix);
    setCurrency(found.currency_code);
    setCurrencyValue(String(found.currency_value_in_xaf || 1));
    setFlag(found.flag_emoji || '');
  };

  const toggleMethod = (m: string) => {
    setMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const save = async () => {
    setErr('');
    if (!code || code.length < 2) return setErr('Invalid country code.');
    if (!name.trim()) return setErr('Name required.');
    if (!phonePrefix.startsWith('+')) return setErr('Phone prefix must start with +.');

    setBusy(true);
    const { error } = await supabase.from('supported_countries').upsert({
      code: code.toUpperCase(),
      name: name.trim(),
      phone_prefix: phonePrefix.trim(),
      currency_code: currency.trim().toUpperCase(),
      currency_value_in_xaf: Number(currencyValue) || 1,
      flag_emoji: flag.trim() || null,
      enabled_methods: methods,
      is_active: true,
    }, { onConflict: 'code' });

    if (error) { setErr(error.message); setBusy(false); return; }
    setBusy(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
          <p className="text-[13px] font-bold text-navy dark:text-white">
            {existing ? `Edit ${existing.name}` : 'Add country'}
          </p>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          {!existing && availableCountries.length > 0 && (
            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                <Globe size={11} /> Pick from list
              </label>
              <select
                onChange={(e) => pickExisting(e.target.value)}
                value=""
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
              >
                <option value="">-- Choose a country --</option>
                {availableCountries.map((c: any) => (
                  <option key={c.code} value={c.code}>
                    {c.flag_emoji || ''} {c.name} ({c.phone_prefix}, {c.currency_code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Code</label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 2))}
                disabled={!!existing}
                placeholder="CM"
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Flag emoji</label>
              <input
                value={flag}
                onChange={e => setFlag(e.target.value)}
                placeholder="🇨🇲"
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Country name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Cameroon"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Phone prefix</label>
              <input
                value={phonePrefix}
                onChange={e => setPhonePrefix(e.target.value)}
                placeholder="+237"
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Currency</label>
              <input
                value={currency}
                onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="XAF"
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">
              Value of 1 {currency} in XAF
            </label>
            <input
              type="number"
              value={currencyValue}
              onChange={e => setCurrencyValue(e.target.value)}
              placeholder="1"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
            />
            <p className="text-[9px] text-gray-400 mt-1">
              Example: if 1 NGN = 0.0024 XAF, enter 0.0024.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 block">
              Enabled payment methods
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['mtn_momo','orange_money','airtel_money','moov_money'].map(m => (
                <button
                  key={m}
                  onClick={() => toggleMethod(m)}
                  className={`p-2.5 rounded-lg border-2 text-[10px] font-bold capitalize ${
                    methods.includes(m) ? 'border-accent bg-accent/5 text-accent' : 'border-gray-200 dark:border-darkline text-navy dark:text-white'
                  }`}
                >
                  {m.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {err && <p className="text-[11px] text-red-600">{err}</p>}

          <button
            onClick={save}
            disabled={busy}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save country'}
          </button>
        </div>
      </div>
    </div>
  );
                                                                                                          }
