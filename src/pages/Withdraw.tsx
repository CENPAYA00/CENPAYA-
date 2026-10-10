import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Smartphone, AlertCircle } from 'lucide-react';

type WithdrawalMethod = {
  provider_name: string;
  country_iso: string;
  payment_method: string;
  action: 'withdrawal';
  fee_pct: number;
  fee_fixed: number;
  min_amount: number | null;
  max_amount: number | null;
  is_active: boolean;
};

export default function Withdraw() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<any>(null);
  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<WithdrawalMethod | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [walletSource, setWalletSource] = useState<'funds' | 'referral'>('funds');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [walletRes, methodsRes, userRes] = await Promise.all([
        supabase.from('wallets').select('*').eq('user_id', user.id).single(),
        supabase.from('aggregator_fees').select('*').eq('action', 'withdrawal').eq('is_active', true),
        supabase.from('users').select('country_iso, phone').eq('id', user.id).single(),
      ]);

      if (walletRes.data) setWallet(walletRes.data);

      if (methodsRes.data) {
        const all = methodsRes.data as WithdrawalMethod[];
        setMethods(all);

        // Filter by user's country
        const countryMethods = userRes.data
          ? all.filter(m => m.country_iso === userRes.data.country_iso)
          : [];

        if (countryMethods.length > 0) setSelectedMethod(countryMethods[0]);
      }

      // Prefill phone if user already has one
      if (userRes.data?.phone) setPhoneNumber(userRes.data.phone);
    };
    load();
  }, []);

  const calculateFee = () => {
    if (!selectedMethod || !amount) return { fee: 0, net: 0 };
    const amt = parseFloat(amount) || 0;
    const fee = (amt * (selectedMethod.fee_pct / 100)) + selectedMethod.fee_fixed;
    return { fee, net: amt - fee };
  };

  const handleWithdraw = async () => {
    setErrorMsg('');

    if (!wallet) return setErrorMsg('Wallet not loaded.');
    if (!selectedMethod) return setErrorMsg('Please select a withdrawal method.');
    if (!phoneNumber || phoneNumber.trim().length < 8) {
      return setErrorMsg('Please enter a valid mobile money number.');
    }
    if (!amount || parseFloat(amount) <= 0) {
      return setErrorMsg('Please enter a valid amount.');
    }

    const availableBalance = walletSource === 'funds'
      ? wallet.available_funds
      : wallet.referral_earnings_available;

    if (parseFloat(amount) > availableBalance) {
      return setErrorMsg('Amount exceeds available balance.');
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.functions.invoke('initiate-withdrawal', {
      body: {
        user_id: user.id,
        wallet: walletSource,
        amount: parseFloat(amount),
        provider: selectedMethod.provider_name,
        phone_number: phoneNumber.trim(),
      },
    });

    if (error) {
      setErrorMsg('Withdrawal failed: ' + error.message);
    } else {
      alert('Withdrawal request submitted! You will be notified once processed.');
      navigate('/wallet');
    }
    setLoading(false);
  };

  const { fee, net } = calculateFee();

  if (!wallet) {
    return (
      <div className="px-3 py-3 pb-24">
        <div className="h-32 bg-gray-200 rounded-2xl animate-pulse"></div>
      </div>
    );
  }

  const availableBalance = walletSource === 'funds'
    ? wallet.available_funds
    : wallet.referral_earnings_available;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-bold text-navy">Withdraw Funds</h1>
      </div>

      {/* Wallet source */}
      <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] text-gray-500 mb-2">Withdraw from:</p>
        <div className="flex gap-2">
          <button
            onClick={() => setWalletSource('funds')}
            className={`flex-1 p-2.5 rounded-lg font-bold text-[11px] ${
              walletSource === 'funds' ? 'bg-brand text-white' : 'bg-gray-100 text-navy'
            }`}
          >
            Funds ({(wallet.available_funds || 0).toLocaleString()})
          </button>
          <button
            onClick={() => setWalletSource('referral')}
            className={`flex-1 p-2.5 rounded-lg font-bold text-[11px] ${
              walletSource === 'referral' ? 'bg-brand text-white' : 'bg-gray-100 text-navy'
            }`}
          >
            Referrals ({(wallet.referral_earnings_available || 0).toLocaleString()})
          </button>
        </div>
      </div>

      {/* Provider + network */}
      <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-medium text-gray-600 mb-1">
          Withdrawal Provider
        </label>
        <select
          value={selectedMethod ? `${selectedMethod.provider_name}|${selectedMethod.payment_method}` : ''}
          onChange={(e) => {
            const [p, m] = e.target.value.split('|');
            const found = methods.find(x => x.provider_name === p && x.payment_method === m);
            if (found) setSelectedMethod(found);
          }}
          className="w-full p-2.5 border border-gray-200 rounded-lg bg-gray-50 text-xs mb-2"
        >
          <option value="">-- Select --</option>
          {methods.map(m => (
            <option key={`${m.provider_name}|${m.payment_method}`} value={`${m.provider_name}|${m.payment_method}`}>
              {m.provider_name} — {m.payment_method.replace(/_/g, ' ')}
            </option>
          ))}
        </select>

        {selectedMethod && (
          <p className="text-[9px] text-gray-500">
            Fee: {selectedMethod.fee_pct}% + {selectedMethod.fee_fixed} XAF
            {selectedMethod.min_amount ? ` • Min: ${selectedMethod.min_amount} XAF` : ''}
          </p>
        )}
      </div>

      {/* Phone number */}
      <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-medium text-gray-600 mb-1 flex items-center gap-1">
          <Smartphone size={11} /> Mobile Money Number
        </label>
        <input
          type="tel"
          value={phoneNumber}
          onChange={e => setPhoneNumber(e.target.value)}
          placeholder="+237 6XX XXX XXX"
          className="w-full p-2.5 border border-gray-200 rounded-lg bg-gray-50 text-xs"
        />
        <p className="text-[9px] text-gray-400 mt-1">
          The money will be sent to this number. Double-check before submitting.
        </p>
      </div>

      {/* Amount */}
      <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-medium text-gray-600 mb-1">
          Amount (XAF)
        </label>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Enter amount"
          className="w-full p-2.5 border border-gray-200 rounded-lg bg-gray-50 text-xs"
        />
        <p className="text-[9px] text-gray-400 mt-1">
          Available: {availableBalance.toLocaleString()} XAF
        </p>
      </div>

      {/* Fee summary */}
      {amount && (
        <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
          <div className="flex justify-between text-[10px] mb-2">
            <span className="text-gray-500">Amount</span>
            <span className="font-bold text-navy">{parseFloat(amount).toLocaleString()} XAF</span>
          </div>
          <div className="flex justify-between text-[10px] mb-2">
            <span className="text-gray-500">Aggregator Fee</span>
            <span className="font-bold text-red-500">-{fee.toFixed(0)} XAF</span>
          </div>
          <div className="flex justify-between text-[11px] border-t pt-2">
            <span className="text-gray-500">You Receive</span>
            <span className="font-black text-accent">{net.toFixed(0)} XAF</span>
          </div>
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3 flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleWithdraw}
        disabled={loading || !amount || !phoneNumber || parseFloat(amount) > availableBalance}
        className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50 active:scale-[0.98] transition-transform"
      >
        {loading ? 'Processing...' : 'Request Withdrawal'}
      </button>
    </div>
  );
          }
