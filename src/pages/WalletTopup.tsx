import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Smartphone, AlertCircle, Check } from 'lucide-react';
import {
  getMethodsForCountry,
  computeFee,
  pickAggregator,
  type CleanMethod,
} from '../utils/routeAggregator';
import { useI18n } from '../contexts/i18n';

export default function WalletTopup() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [methods, setMethods] = useState<CleanMethod[]>([]);
  const [selected, setSelected] = useState<CleanMethod | null>(null);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [country, setCountry] = useState('CM');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('country_iso, phone')
        .eq('id', user.id)
        .single();
      const iso = data?.country_iso || 'CM';
      setCountry(iso);
      if (data?.phone) setPhone(data.phone);

      const list = await getMethodsForCountry(iso, 'topup');
      setMethods(list);
      if (list.length > 0) setSelected(list[0]);
    };
    load();
  }, []);

  const { fee, total } = selected && amount
    ? computeFee(selected, parseFloat(amount) || 0)
    : { fee: 0, total: 0 };

  const handleTopUp = async () => {
    setErrorMsg('');
    if (!selected) return setErrorMsg(t('select_method'));
    if (!phone || phone.trim().length < 8) return setErrorMsg(t('invalid_phone'));
    if (!amount || parseFloat(amount) <= 0) return setErrorMsg(t('invalid_amount'));

    setLoading(true);
    const aggregator = await pickAggregator(country, selected.payment_method);
    if (!aggregator) {
      setErrorMsg('No payment route available for your country.');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { error } = await supabase.functions.invoke('initiate-topup', {
      body: {
        user_id: user.id,
        amount: parseFloat(amount),
        phone_number: phone.trim(),
        payment_method: selected.payment_method,
        aggregator,
        country_iso: country,
      },
    });

    if (error) {
      setErrorMsg('Top-up failed: ' + error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/wallet'), 1800);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mb-3">
          <Check size={28} className="text-accent" />
        </div>
        <p className="text-[13px] font-bold text-navy">{t('success')}</p>
        <p className="text-[10px] text-gray-500 mt-1">Follow the prompt on your phone to approve the payment.</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-bold text-navy">{t('top_up')}</h1>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">
          {t('payment_method')}
        </p>
        {methods.length === 0 && (
          <p className="text-[10px] text-gray-400">No top-up methods available.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {methods.map(m => (
            <button
              key={m.payment_method}
              onClick={() => setSelected(m)}
              className={`p-3 rounded-xl border-2 flex items-center gap-2 ${
                selected?.payment_method === m.payment_method
                  ? 'border-accent bg-accent/5'
                  : 'border-gray-200 dark:border-darkline'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg ${m.color} text-white text-[8px] font-bold flex items-center justify-center`}>
                {m.label.split(' ')[0].slice(0,2).toUpperCase()}
              </div>
              <div className="text-left flex-1">
                <p className="text-[10px] font-bold text-navy dark:text-white">{m.label}</p>
                <p className="text-[9px] text-gray-500">{m.fee_pct}% + {m.fee_fixed}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
          <Smartphone size={11} /> {t('mobile_money_number')}
        </label>
        <input
          type="
