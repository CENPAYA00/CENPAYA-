import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Smartphone, AlertCircle, Check } from 'lucide-react';
import { PaymentMethodLogo, METHOD_LABELS } from '../components/PaymentMethodLogo';

type Method = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';
const METHODS: Method[] = ['mtn_momo', 'orange_money', 'airtel_money', 'moov_money'];

export default function WalletTopup() {
  const navigate = useNavigate();
  const [countries, setCountries] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('CM');
  const [provider, setProvider] = useState<Method>('mtn_momo');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [userRes, countriesRes] = await Promise.all([
        supabase.from('users').select('country_iso, phone, momo_number, momo_provider').eq('id', user.id).single(),
        supabase.from('supported_countries').select('code, name, phone_prefix').eq('is_active', true).order('code'),
      ]);
      setCountries(countriesRes.data || []);
      const iso = userRes.data?.country_iso || 'CM';
      setSelectedCountry(iso);
      if (userRes.data?.momo_number) setPhone(userRes.data.momo_number.replace(/^\+\d+\s?/, ''));
      else if (userRes.data?.phone) setPhone(userRes.data.phone.replace(/^\+\d+\s?/, ''));
      if (userRes.data?.momo_provider) setProvider(userRes.data.momo_provider as Method);
    };
    load();
  }, []);

  const country = countries.find((c) => c.code === selectedCountry);
  const prefix = country?.phone_prefix || '+237';

  const submit = async () => {
    setErrorMsg('');
    if (!phone.trim() || phone.trim().length < 6) return setErrorMsg('Enter a valid mobile money number.');
    if (!amount || Number(amount) <= 0) return setErrorMsg('Enter a valid amount.');

    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }

    const { error } = await supabase.functions.invoke('initiate-payment', {
      body: {
        topup: true,
        user_id: user.id,
        amount: Number(amount),
        phone_number: `${prefix} ${phone.trim()}`,
        payment_method: provider,
        country_iso: selectedCountry,
      },
    });

    if (error) {
      setErrorMsg('Top-up failed: ' + error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/wallet'), 1800);
    }
    setBusy(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mb-3">
          <Check size={28} className="text-accent" />
        </div>
        <p className="text-[13px] font-bold text-navy dark:text-white">Top-up requested</p>
        <p className="text-[10px] text-gray-500 mt-1">Follow the prompt on your phone to approve.</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Top Up</h1>
      </div>

      {/* Country */}
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5">Country</p>
        <select
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.name} ({c.phone_prefix})</option>
          ))}
        </select>
        <p className="text-[9px] text-gray-400 mt-1.5">
          Available top-up methods in {country?.name || 'Cameroon'}: {METHODS.map(m => METHOD_LABELS[m].split(' ')[0]).join(', ')}
        </p>
      </div>

      {/* Payment method */}
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">Top-up method</p>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <button
              key={m}
              onClick={() => setProvider(m)}
              className={`p-2.5 rounded-xl border-2 flex items-center gap-2 ${
                provider === m ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
              }`}
            >
              <PaymentMethodLogo method={m} size={28} />
              <p className="text-[10px] font-bold text-navy dark:text-white text-left">
                {METHOD_LABELS[m].split(' ')[0]}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Phone */}
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
          <Smartphone size={11} /> Mobile Money Number
        </label>
        <div className="flex gap-2">
          <div className="px-3 py-2.5 bg-gray-100 dark:bg-darkline rounded-lg text-xs font-bold text-navy dark:text-white shrink-0">
            {prefix}
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="6XX XXX XXX"
            className="flex-1 p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
          />
        </div>
      </div>

      {/* Amount */}
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5">Amount (XAF)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount"
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
        />
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl mb-3 flex items-start gap-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || !amount || !phone}
        className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
      >
        {busy ? 'Processing...' : 'Top Up'}
      </button>
    </div>
  );
    }
