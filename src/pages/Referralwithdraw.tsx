import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Smartphone, AlertCircle, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { PaymentMethodLogo, METHOD_LABELS } from '../components/PaymentMethodLogo';

type Method = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';
const METHODS: Method[] = ['mtn_momo', 'orange_money', 'airtel_money', 'moov_money'];
const MIN = 2000;

export default function ReferralWithdraw() {
  const navigate = useNavigate();
  const [available, setAvailable] = useState(0);
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<Method>('mtn_momo');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) return;
      const [walletRes, userRes] = await Promise.all([
        supabase.from('wallets').select('referral_earnings_available').eq('user_id', me.id).single(),
        supabase.from('users').select('phone, momo_number, momo_provider').eq('id', me.id).single(),
      ]);
      if (walletRes.data) setAvailable(walletRes.data.referral_earnings_available || 0);
      if (userRes.data?.momo_number) {
        setPhone(userRes.data.momo_number);
        if (userRes.data.momo_provider) setProvider(userRes.data.momo_provider as Method);
      } else if (userRes.data?.phone) {
        setPhone(userRes.data.phone);
      }
    };
    load();
  }, []);

  const submit = async () => {
    setErrorMsg('');
    const amt = parseFloat(amount);
    if (!amt || amt < MIN) return setErrorMsg(`Minimum withdrawal is ${MIN.toLocaleString()} XAF.`);
    if (amt > available) return setErrorMsg('Amount exceeds available earnings.');
    if (!phone || phone.trim().length < 8) return setErrorMsg('Enter a valid MoMo number.');

    setLoading(true);
    const { data, error } = await supabase.rpc('request_referral_withdrawal', {
      p_amount: amt,
      p_momo_number: phone.trim(),
      p_provider: provider,
    });

    if (error || (data && !data.ok)) {
      setErrorMsg(error?.message || data?.error || 'Withdrawal failed.');
      setLoading(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => navigate('/referrals'), 1800);
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mb-3">
          <Check size={28} className="text-accent" />
        </div>
        <p className="text-[13px] font-bold text-navy dark:text-white">Withdrawal requested</p>
        <p className="text-[10px] text-gray-500 mt-1">You will be notified once it's processed.</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Withdraw referral earnings</h1>
      </div>

      <div className="bg-gradient-to-br from-brand to-brand-dark p-4 rounded-2xl text-white mb-3">
        <p className="text-[10px] text-white/70 uppercase tracking-widest">Available</p>
        <p className="text-2xl font-black mt-1">{available.toLocaleString()} <span className="text-sm">XAF</span></p>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">Amount (XAF)</label>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder={`Min ${MIN}`}
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs mb-1"
        />
        <p className="text-[9px] text-gray-400">Minimum: {MIN.toLocaleString()} XAF · Fee: 0%</p>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">Method</p>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map(m => (
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

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
          <Smartphone size={11} /> MoMo Number
        </label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+237 6XX XXX XXX"
          className="w-full p-2.5 border border-gray-
