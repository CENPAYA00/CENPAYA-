import { useEffect, useState } from 'react';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Me, d1Request } from '../lib/d1Api';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Smartphone, AlertCircle } from 'lucide-react';
import { PaymentMethodLogo, METHOD_LABELS } from '../components/PaymentMethodLogo';
import Select from '../components/Select';

type Method = 'mtn_momo' | 'orange_money';
const METHODS: Method[] = ['mtn_momo', 'orange_money'];

export default function Withdraw() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<any>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('CM');
  const [provider, setProvider] = useState<Method>('mtn_momo');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [walletSource, setWalletSource] = useState<'funds' | 'referral'>('funds');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const { user } = await d1Me();
      if (!user) return;
      const [walletRes, profileRes, countriesRes] = await Promise.all([
        supabaseWorkerRequest<{ data: { available_funds?: number; referral_earnings_available?: number } }>('/api/v1/wallet'),
        d1Request<{ data: { country_iso?: string; phone?: string; momo_number?: string; momo_provider?: string } }>('/api/me/personal-details'),
        d1Request<{ data: Array<{ country_code: string; name: string; phone_prefix: string }> }>('/api/countries'),
      ]);
      setWallet(walletRes.data);
      setCountries((countriesRes.data || []).map(country => ({ code: country.country_code, name: country.name, phone_prefix: country.phone_prefix })));
      const iso = profileRes.data?.country_iso || 'CM';
      setSelectedCountry(iso);
      const savedPhone = profileRes.data?.momo_number || profileRes.data?.phone;
      if (savedPhone) setPhone(savedPhone.replace(/^\+\d+\s?/, ''));
      if (profileRes.data?.momo_provider && METHODS.includes(profileRes.data.momo_provider as Method)) setProvider(profileRes.data.momo_provider as Method);
    };
    load();
  }, []);

  const country = countries.find((c) => c.code === selectedCountry);
  const prefix = country?.phone_prefix || '+237';
  const available = walletSource === 'funds'
    ? (wallet?.available_funds || 0)
    : (wallet?.referral_earnings_available || 0);

  const submit = async () => {
    setErrorMsg('');
    if (!phone.trim() || phone.trim().length < 6) return setErrorMsg('Enter a valid phone number.');
    if (!amount || Number(amount) <= 0) return setErrorMsg('Enter a valid amount.');
    if (Number(amount) > available) return setErrorMsg('Amount exceeds available balance.');

    setBusy(true);
    const { user } = await d1Me();
    if (!user) { setBusy(false); return; }

    try {
      await supabaseWorkerRequest<{ data: { id: string; status: string } }>('/api/v1/wallet/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), gateway_provider: 'FAPSHI', destination_provider: provider, source_bucket: walletSource === 'funds' ? 'available' : 'referral', destination_phone: `${prefix} ${phone.trim()}`, idempotency_key: crypto.randomUUID() }),
      });

      alert('Withdrawal request submitted. Provider confirmation is still pending.');
      navigate('/wallet');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Withdrawal failed';
      if (/insufficient/i.test(message)) setErrorMsg('Insufficient available balance.');
      else if (/payment_provider_rejected_request/i.test(message)) setErrorMsg('The payout provider rejected the withdrawal. Check the destination details.');
      else if (/payment_initiation_uncertain_contact_support|network|timeout/i.test(message)) setErrorMsg('Withdrawal status is uncertain. Check your wallet transactions before retrying, or contact support.');
      else setErrorMsg(message);
    } finally {
      setBusy(false);
    }
  };

  if (!wallet) return <div className="p-4 text-center text-xs">Loading wallet...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Withdraw</h1>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">Withdraw from</p>
        <div className="flex gap-2">
          <button
            onClick={() => setWalletSource('funds')}
            className={`flex-1 p-2.5 rounded-lg font-bold text-[11px] cursor-pointer ${
              walletSource === 'funds' ? 'bg-navy dark:bg-accent text-white' : 'bg-gray-100 dark:bg-darkbg text-navy dark:text-white'
            }`}
          >
            Funds ({(wallet.available_funds || 0).toLocaleString()})
          </button>
          <button
            onClick={() => setWalletSource('referral')}
            className={`flex-1 p-2.5 rounded-lg font-bold text-[11px] cursor-pointer ${
              walletSource === 'referral' ? 'bg-navy dark:bg-accent text-white' : 'bg-gray-100 dark:bg-darkbg text-navy dark:text-white'
            }`}
          >
            Referrals ({(wallet.referral_earnings_available || 0).toLocaleString()})
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <Select
          label="Country"
          value={selectedCountry}
          onChange={setSelectedCountry}
          options={countries.map(c => ({
            value: c.code,
            label: `${c.flag_emoji || ''} ${c.name} (${c.phone_prefix})`.trim(),
          }))}
          placeholder="Choose country"
        />
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">Withdrawal method</p>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <button
              key={m}
              onClick={() => setProvider(m)}
              className={`p-2.5 rounded-xl border-2 flex items-center gap-2 cursor-pointer ${
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

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5">Amount (XAF)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount"
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
        />
        <p className="text-[9px] text-gray-400 mt-1">Available: {available.toLocaleString()} XAF</p>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl mb-3 flex items-start gap-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || !amount || !phone || Number(amount) > available}
        className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50 cursor-pointer"
      >
        {busy ? 'Processing...' : 'Request Withdrawal'}
      </button>
    </div>
  );
        }
