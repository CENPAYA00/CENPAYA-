import { useEffect, useRef, useState } from 'react';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Smartphone, AlertCircle, Check, Clock, RefreshCw } from 'lucide-react';
import { PaymentMethodLogo, METHOD_LABELS } from '../components/PaymentMethodLogo';
import Select from '../components/Select';

type Method = 'mtn_momo' | 'orange_money';
const METHODS: Method[] = ['mtn_momo', 'orange_money'];
const MIN_WITHDRAWAL = 500;

export default function Withdraw() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const idempotencyKey = useRef<string | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('CM');
  const [provider, setProvider] = useState<Method>('mtn_momo');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [walletSource, setWalletSource] = useState<'funds' | 'referral'>(() => searchParams.get('source') === 'referral' ? 'referral' : 'funds');
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [withdrawal, setWithdrawal] = useState<any>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [walletRes, prefsRes] = await Promise.all([
        supabaseWorkerRequest<{ data: any }>('/api/v1/wallet'),
        supabaseWorkerRequest<{ data: { profile: any; countries: any[] } }>('/api/v1/me/payment-preferences'),
      ]);
      if (!active) return;
      setWallet(walletRes.data);
      setCountries(prefsRes.data?.countries || []);
      const profile = prefsRes.data?.profile || {};
      setSelectedCountry(profile.country_iso || 'CM');
      const savedPhone = profile.momo_number || profile.phone;
      if (savedPhone) setPhone(String(savedPhone).replace(/^\+\d+\s?/, ''));
      if (profile.momo_provider && METHODS.includes(profile.momo_provider as Method)) setProvider(profile.momo_provider as Method);
    };
    load().catch((error:any) => { if (active) setErrorMsg(error.message || 'Could not load withdrawal details.'); });
    return () => { active = false; };
  }, []);

  const country = countries.find(c => (c.country_iso || c.code) === selectedCountry);
  const prefix = country?.phone_prefix || '+237';
  const available = walletSource === 'funds' ? Number(wallet?.available_funds || 0) : Number(wallet?.referral_earnings_available || 0);

  const checkStatus = async () => {
    if (!withdrawal?.id) return;
    setStatusBusy(true);
    setErrorMsg('');
    try {
      const result = await supabaseWorkerRequest<{ data: any }>(`/api/v1/wallet/withdrawals/${encodeURIComponent(withdrawal.id)}`);
      setWithdrawal(result.data);
      const status = String(result.data?.status || 'pending').toLowerCase();
      if (status === 'completed' || status === 'failed') {
        idempotencyKey.current = null;
        const refreshed = await supabaseWorkerRequest<{data:any}>('/api/v1/wallet');
        setWallet(refreshed.data);
      }
    } catch (error:any) {
      setErrorMsg(error.message || 'Could not check payout status. Reserved funds remain protected while status is uncertain.');
    } finally {
      setStatusBusy(false);
    }
  };

  const submit = async () => {
    setErrorMsg('');
    const parsedAmount = Number(amount);
    const digits = phone.replace(/\D/g, '');
    if (!/^6\d{8}$/.test(digits)) return setErrorMsg('Enter a valid Cameroon Mobile Money number (9 digits starting with 6).');
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount < MIN_WITHDRAWAL) return setErrorMsg(`Minimum withdrawal is ${MIN_WITHDRAWAL.toLocaleString()} XAF.`);
    if (parsedAmount > available) return setErrorMsg('Amount exceeds the selected available balance.');
    setBusy(true);
    try {
      const key = idempotencyKey.current || (idempotencyKey.current = crypto.randomUUID());
      const result = await supabaseWorkerRequest<{ data: any }>('/api/v1/wallet/withdrawals', {
        method: 'POST',
        body: JSON.stringify({
          amount: parsedAmount, gateway_provider: 'FAPSHI', destination_provider: provider,
          source_bucket: walletSource === 'funds' ? 'available' : 'referral',
          destination_phone: `${prefix} ${digits}`, idempotency_key: key,
        }),
      });
      if (!result.data?.id) throw new Error('Withdrawal reference was not returned. Check your wallet history before retrying.');
      let currentState = result.data;
      try {
        const statusResult = await supabaseWorkerRequest<{ data: any }>(`/api/v1/wallet/withdrawals/${encodeURIComponent(result.data.id)}`);
        currentState = statusResult.data || currentState;
        const refreshedWallet = await supabaseWorkerRequest<{data:any}>('/api/v1/wallet');
        setWallet(refreshedWallet.data);
      } catch { /* Keep the request reference visible even if status lookup is temporarily unavailable. */ }
      setWithdrawal({ ...currentState, requested_amount: currentState.requested_amount ?? parsedAmount });
      setAmount('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Withdrawal failed';
      if (/payment_provider_rejected_request/i.test(message)) {
        idempotencyKey.current = null;
        setErrorMsg('The payout provider rejected this withdrawal. Check the destination number and try again.');
      } else if (/payment_initiation_uncertain_contact_support|network|timeout/i.test(message)) {
        setErrorMsg('Payout status is uncertain. Do not create a new request; retry this same request or contact support.');
      } else if (/insufficient/i.test(message)) {
        idempotencyKey.current = null;
        setErrorMsg('Insufficient available balance.');
      } else {
        setErrorMsg(message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (withdrawal) {
    const status = String(withdrawal.status || 'pending').toLowerCase();
    const completed = status === 'completed';
    const failed = status === 'failed' || status === 'cancelled';
    return (
      <div className="px-4 py-6 pb-24">
        <div className="flex items-center gap-2 mb-5"><button onClick={()=>navigate(-1)} className="text-brand"><ArrowLeft size={18}/></button><h1 className="text-base font-bold text-navy dark:text-white">Withdrawal status</h1></div>
        <div className="bg-white dark:bg-darkcard rounded-2xl p-5 text-center shadow-sm">
          <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${completed?'bg-green-100 text-green-600':failed?'bg-red-100 text-red-600':'bg-amber-100 text-amber-700'}`}>{completed?<Check size={28}/>:failed?<AlertCircle size={28}/>:<Clock size={28}/>}</div>
          <p className="text-sm font-bold text-navy dark:text-white">{completed?'Withdrawal completed':failed?'Withdrawal failed':'Payout processing'}</p>
          <p className="text-xs text-gray-500 mt-2">{completed?'The payout provider confirmed your transfer.':failed?'The payout failed. Any reserved amount and provisional fee reversal are handled by the financial ledger.':'Your payout is being processed. Funds remain reserved until the provider confirms success or failure.'}</p>
          <div className="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-left space-y-1">
            <p className="text-[10px] text-gray-500">Requested: <b className="text-navy dark:text-white">{Number(withdrawal.requested_amount || 0).toLocaleString()} XAF</b></p>
            <p className="text-[10px] text-gray-500">Fee: <b className="text-navy dark:text-white">{Number(withdrawal.fee_charged || 0).toLocaleString()} XAF</b></p>
            <p className="text-[10px] text-gray-500">Net payout: <b className="text-navy dark:text-white">{Number(withdrawal.net_disbursement || 0).toLocaleString()} XAF</b></p>
            <p className="text-[10px] text-gray-500">Reference: <b className="text-navy dark:text-white break-all">{withdrawal.id}</b></p>
          </div>
          {errorMsg && <p className="text-xs text-red-600 mt-3">{errorMsg}</p>}
          {!completed && !failed && <button onClick={checkStatus} disabled={statusBusy} className="w-full mt-4 bg-brand text-white rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"><RefreshCw size={14}/>{statusBusy?'Checking…':'Check payout status'}</button>}
          <button onClick={()=>navigate('/wallet')} className="w-full mt-2 border border-gray-200 dark:border-darkline rounded-xl py-3 text-xs font-bold">Go to Wallet</button>
          {failed && <button onClick={()=>{setWithdrawal(null);setAmount('');}} className="w-full mt-2 bg-brand text-white rounded-xl py-3 text-xs font-bold">Request another withdrawal</button>}
        </div>
      </div>
    );
  }

  if (!wallet) return <div className="p-4 text-center text-xs">{errorMsg || 'Loading wallet…'}</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3"><button onClick={()=>navigate(-1)} className="text-brand"><ArrowLeft size={18}/></button><h1 className="text-base font-bold text-navy dark:text-white">Withdraw</h1></div>
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">Withdraw from</p>
        <div className="flex gap-2">
          <button onClick={()=>setWalletSource('funds')} className={`flex-1 p-2.5 rounded-lg font-bold text-[11px] ${walletSource==='funds'?'bg-navy dark:bg-accent text-white':'bg-gray-100 dark:bg-darkbg text-navy dark:text-white'}`}>Wallet ({Number(wallet.available_funds||0).toLocaleString()} XAF)</button>
          <button onClick={()=>setWalletSource('referral')} className={`flex-1 p-2.5 rounded-lg font-bold text-[11px] ${walletSource==='referral'?'bg-navy dark:bg-accent text-white':'bg-gray-100 dark:bg-darkbg text-navy dark:text-white'}`}>Referral ({Number(wallet.referral_earnings_available||0).toLocaleString()} XAF)</button>
        </div>
      </div>
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3"><Select label="Country" value={selectedCountry} onChange={setSelectedCountry} options={countries.map(c=>({value:c.country_iso||c.code,label:`${c.name} (${c.phone_prefix})`}))} placeholder="Choose country"/></div>
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">Payout network</p>
        <div className="grid grid-cols-2 gap-2">{METHODS.filter(m=>(country?.enabled_methods||METHODS).includes(m)).map(m=><button key={m} onClick={()=>setProvider(m)} aria-pressed={provider===m} className={`p-2.5 rounded-xl border-2 flex items-center gap-2 ${provider===m?'border-accent bg-accent/5':'border-gray-200 dark:border-darkline'}`}><PaymentMethodLogo method={m} size={28}/><span className="text-[10px] font-bold text-navy dark:text-white">{METHOD_LABELS[m].split(' ')[0]}</span></button>)}</div>
      </div>
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5"><Smartphone size={11} className="inline mr-1"/>Mobile Money Number</label>
        <div className="flex gap-2"><div className="px-3 py-2.5 bg-gray-100 dark:bg-darkline rounded-lg text-xs font-bold text-navy dark:text-white shrink-0">{prefix}</div><input type="tel" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))} placeholder="6XX XXX XXX" autoComplete="tel-national" className="flex-1 p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"/></div>
      </div>
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5">Amount (XAF)</label>
        <input type="number" min={MIN_WITHDRAWAL} step="1" value={amount} onChange={e=>setAmount(e.target.value)} placeholder={`Minimum ${MIN_WITHDRAWAL}`} className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"/>
        <p className="text-[9px] text-gray-400 mt-1">Available: {available.toLocaleString()} XAF · Minimum: {MIN_WITHDRAWAL.toLocaleString()} XAF</p>
      </div>
      {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl mb-3 flex items-start gap-2"><AlertCircle size={13} className="shrink-0 mt-0.5"/>{errorMsg}</div>}
      <button onClick={submit} disabled={busy||!amount||!phone||Number(amount)>available} className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50">{busy?'Processing…':'Request withdrawal'}</button>
    </div>
  );
}
