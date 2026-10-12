import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Smartphone, AlertCircle } from 'lucide-react';
import {
  getMethodsForCountry,
  computeFee,
  pickAggregator,
  type CleanMethod,
} from '../utils/routeAggregator';
import { useI18n } from '../contexts/i18n';

export default function Withdraw() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [wallet, setWallet] = useState<any>(null);
  const [methods, setMethods] = useState<CleanMethod[]>([]);
  const [selected, setSelected] = useState<CleanMethod | null>(null);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [walletSource, setWalletSource] = useState<'funds' | 'referral'>('funds');
  const [country, setCountry] = useState('CM');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [walletRes, userRes] = await Promise.all([
        supabase.from('wallets').select('*').eq('user_id', user.id).single(),
        supabase.from('users').select('country_iso, phone').eq('id', user.id).single(),
      ]);

      if (walletRes.data) setWallet(walletRes.data);

      const iso = userRes.data?.country_iso || 'CM';
      setCountry(iso);
      if (userRes.data?.phone) setPhone(userRes.data.phone);

      const list = await getMethodsForCountry(iso, 'withdrawal');
      setMethods(list);
      if (list.length > 0) setSelected(list[0]);
    };
    load();
  }, []);

  const { fee, net } = selected && amount
    ? (() => {
        const amt = parseFloat(amount) || 0;
        const f = (amt * (selected.fee_pct / 100)) + selected.fee_fixed;
        return { fee: f, net: amt - f };
      })()
    : { fee: 0, net: 0 };

  const handleWithdraw = async () => {
    setErrorMsg('');
    if (!wallet) return setErrorMsg('Wallet not loaded.');
    if (!selected) return setErrorMsg(t('select_method'));
    if (!phone || phone.trim().length < 8) return setErrorMsg(t('invalid_phone'));
    if (!amount || parseFloat(amount) <= 0) return setErrorMsg(t('invalid_amount'));

    const available = walletSource === 'funds'
      ? wallet.available_funds
      : wallet.referral_earnings_available;
    if (parseFloat(amount) > available) return setErrorMsg(t('insufficient_balance'));

    setLoading(true);
    const aggregator = await pickAggregator(country, selected.payment_method);
    if (!aggregator) {
      setErrorMsg('No withdrawal route available for your country.');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { error } = await supabase.functions.invoke('initiate-withdrawal', {
      body: {
        user_id: user.id,
        wallet: walletSource,
        amount: parseFloat(amount),
        payment_method: selected.payment_method,
        aggregator,
        phone_number: phone.trim(),
      },
    });

    if (error) {
      setErrorMsg('Withdrawal failed: ' + error.message);
    } else {
      alert(t('withdrawal_submitted'));
      navigate('/wallet');
    }
    setLoading(false);
  };

  if (!wallet) {
    return (
      <div className="px-3 py-3 pb-24">
        <div className="h-32 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
      </div>
    );
  }

  const available = walletSource === 'funds'
    ? wallet.available_funds
    : wallet.referral_earnings_available;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-bold text-navy">{t('withdraw')}</h1>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] text-gray-500 mb-2">{t('withdraw')}:</p>
        <div className="flex gap-2">
          <button
            onClick={() => setWalletSource('funds')}
            className={`flex-1 p-2.5 rounded-lg font-bold text-[11px] ${
              walletSource === 'funds' ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-darkbg text-navy'
            }`}
          >
            {t('wallet_funds')} ({(wallet.available_funds || 0).toLocaleString()})
          </button>
          <button
            onClick={() => setWalletSource('referral')}
            className={`flex-1 p-2.5 rounded-lg font-bold text-[11px] ${
              walletSource === 'referral' ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-darkbg text-navy'
            }`}
          >
            {t('wallet_referrals')} ({(wallet.referral_earnings_available || 0).toLocaleString()})
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">
          {t('payment_method')}
        </p>
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
                {m.label.split(' ')[0].slice(0, 2).toUpperCase()}
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
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+237 6XX XXX XXX"
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
        />
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">
          {t('amount')} (XAF)
        </label>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Enter amount"
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
        />
        <p className="text-[9px] text-gray-400 mt-1">
          {t('available_balance')}: {available.toLocaleString()} XAF
        </p>
      </div>

      {amount && (
        <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
          <div className="flex justify-between text-[10px] mb-2">
            <span className="text-gray-500">{t('amount')}</span>
            <span className="font-bold text-navy dark:text-white">
              {parseFloat(amount).toLocaleString()} XAF
            </span>
          </div>
          <div className="flex justify-between text-[10px] mb-2">
            <span className="text-gray-500">{t('fee')}</span>
            <span className="font-bold text-red-500">-{fee.toFixed(0)} XAF</span>
          </div>
          <div className="flex justify-between text-[11px] border-t pt-2">
            <span className="text-gray-500">{t('you_receive')}</span>
            <span className="font-black text-accent">{net.toFixed(0)} XAF</span>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3 flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      <button
        onClick={handleWithdraw}
        disabled={loading || !amount || !phone || parseFloat(amount) > available}
        className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50 active:scale-[0.98]"
      >
        {loading ? t('processing') : t('request_withdrawal')}
      </button>
    </div>
  );
  }
