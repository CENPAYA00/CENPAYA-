import { useEffect, useRef, useState } from 'react';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Me, d1Request } from '../lib/d1Api';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Smartphone, AlertCircle, Check, RefreshCw, Clock } from 'lucide-react';
import { PaymentMethodLogo, METHOD_LABELS } from '../components/PaymentMethodLogo';
import Select from '../components/Select';

type Method = 'mtn_momo' | 'orange_money';
const METHODS: Method[] = ['mtn_momo', 'orange_money'];
const MIN_TOPUP = 100;

export default function WalletTopup() {
  const navigate = useNavigate();
  const idempotencyKey = useRef<string | null>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('CM');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [topupId, setTopupId] = useState<string | null>(null);
  const [topupStatus, setTopupStatus] = useState('pending');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { user } = await d1Me();
      if (!user) return;
      const [profileRes, countriesRes] = await Promise.all([
        d1Request<{ data: { country_iso?: string; phone?: string; momo_number?: string } }>('/api/me/personal-details'),
        d1Request<{ data: Array<{ country_code: string; name: string; phone_prefix: string }> }>('/api/countries'),
      ]);
      if (!active) return;
      setCountries((countriesRes.data || []).map(country => ({ code: country.country_code, name: country.name, phone_prefix: country.phone_prefix })));
      const iso = profileRes.data?.country_iso || 'CM';
      setSelectedCountry(iso);
      const savedPhone = profileRes.data?.momo_number || profileRes.data?.phone;
      if (savedPhone) setPhone(savedPhone.replace(/^\+\d+\s?/, ''));
    };
    load().catch((error: any) => { if (active) setErrorMsg(error?.message || 'Could not load payment details.'); });
    return () => { active = false; };
  }, []);

  const country = countries.find(c => c.code === selectedCountry);
  const prefix = country?.phone_prefix || '+237';

  const checkStatus = async () => {
    if (!topupId) return;
    setStatusBusy(true);
    setErrorMsg('');
    try {
      const result = await supabaseWorkerRequest<{ data: { status: string } }>(`/api/v1/wallet/topups/${encodeURIComponent(topupId)}`);
      const status = String(result.data?.status || 'pending').toLowerCase();
      setTopupStatus(status);
      if (status === 'completed') idempotencyKey.current = null;
      if (status === 'failed' || status === 'cancelled') {
        idempotencyKey.current = null;
        setErrorMsg('The payment was not completed. You can start a new top-up.');
      }
    } catch (error: any) {
      setErrorMsg(error.message || 'Could not check payment status. Your request may still be processing.');
    } finally {
      setStatusBusy(false);
    }
  };

  const submit = async () => {
    setErrorMsg('');
    const parsedAmount = Number(amount);
    const digits = phone.replace(/\D/g, '');
    if (!/^6\d{8}$/.test(digits)) return setErrorMsg('Enter a valid Cameroon mobile money number (9 digits starting with 6).');
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount < MIN_TOPUP) return setErrorMsg(`Minimum top-up is ${MIN_TOPUP.toLocaleString()} XAF.`);

    setBusy(true);
    try {
      const { user } = await d1Me();
      if (!user) throw new Error('Please log in to top up your wallet.');
      const key = idempotencyKey.current || (idempotencyKey.current = crypto.randomUUID());
      const response = await supabaseWorkerRequest<{ data: { id: string; status?: string; checkout_url?: string | null } }>('/api/v1/wallet/topups', {
        method: 'POST',
        body: JSON.stringify({ amount: parsedAmount, provider: 'CAMPAY', phone: `${prefix} ${digits}`, idempotency_key: key }),
      });
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
        return;
      }
      if (!response.data.id) throw new Error('The provider did not return a top-up reference. Check your wallet before retrying.');
      setTopupId(response.data.id);
      setTopupStatus(String(response.data.status || 'pending').toLowerCase());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      if (/payment_provider_rejected_request/i.test(message)) {
        idempotencyKey.current = null;
        setErrorMsg('The payment provider rejected this top-up. Check your number and try again.');
      } else if (/payment_initiation_uncertain_contact_support|network|timeout/i.test(message)) {
        setErrorMsg('The top-up status is uncertain. Retry only with this same request, or check your wallet transactions and contact support.');
      } else if (/topup_initiation_in_progress/i.test(message)) {
        setErrorMsg('Your top-up is already being initiated. Check its status before trying again.');
      } else {
        idempotencyKey.current = null;
        setErrorMsg('Top-up failed: ' + message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (topupId) {
    const complete = topupStatus === 'completed';
    const failed = topupStatus === 'failed' || topupStatus === 'cancelled';
    return (
      <div className="px-4 py-6 pb-24">
        <div className="flex items-center gap-2 mb-5"><button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18}/></button><h1 className="text-base font-bold text-navy dark:text-white">Top-up status</h1></div>
        <div className="bg-white dark:bg-darkcard rounded-2xl p-5 text-center shadow-sm">
          <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${complete?'bg-green-100 text-green-600':failed?'bg-red-100 text-red-600':'bg-amber-100 text-amber-700'}`}>
            {complete?<Check size={28}/>:failed?<AlertCircle size={28}/>:<Clock size={28}/>}
          </div>
          <p className="text-sm font-bold text-navy dark:text-white">{complete?'Wallet topped up':failed?'Top-up not completed':'Payment request sent'}</p>
          <p className="text-xs text-gray-500 mt-2">{complete?'Your wallet has been credited after provider confirmation.':failed?'The provider did not confirm this payment.':'Approve the payment prompt on your phone. Your wallet is credited only after the provider confirms payment.'}</p>
          <p className="text-[10px] text-gray-400 mt-3">Reference: {topupId}</p>
          {errorMsg && <p className="text-xs text-red-600 mt-3">{errorMsg}</p>}
          {!complete && <button onClick={checkStatus} disabled={statusBusy} className="w-full mt-4 bg-brand text-white rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"><RefreshCw size={14}/>{statusBusy?'Checking…':'Check payment status'}</button>}
          {complete && <button onClick={() => navigate('/wallet')} className="w-full mt-4 bg-brand text-white rounded-xl py-3 text-xs font-bold">Go to Wallet</button>}
          {failed && <button onClick={() => { setTopupId(null); setTopupStatus('pending'); setAmount(''); }} className="w-full mt-2 border border-gray-200 dark:border-darkline rounded-xl py-3 text-xs font-bold">Start a new top-up</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3"><button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18}/></button><h1 className="text-base font-bold text-navy dark:text-white">Top Up Wallet</h1></div>
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <Select label="Country" value={selectedCountry} onChange={setSelectedCountry} options={countries.map(c=>({value:c.code,label:`${c.name} (${c.phone_prefix})`}))} placeholder="Choose country"/>
        <p className="text-[9px] text-gray-400 mt-2">CamPay supports MTN and Orange Mobile Money in Cameroon. It detects the network from the phone number.</p>
      </div>
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">Supported networks</p>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map(m=><div key={m} className="p-2.5 rounded-xl border border-gray-200 dark:border-darkline flex items-center gap-2"><PaymentMethodLogo method={m} size={30}/><span className="text-[10px] font-bold text-navy dark:text-white">{METHOD_LABELS[m].split(' ')[0]}</span></div>)}
        </div>
      </div>
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 items-center gap-1"><Smartphone size={11}/> Mobile Money Number</label>
        <div className="flex gap-2"><div className="px-3 py-2.5 bg-gray-100 dark:bg-darkline rounded-lg text-xs font-bold text-navy dark:text-white shrink-0">{prefix}</div><input type="tel" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))} placeholder="6XX XXX XXX" autoComplete="tel-national" className="flex-1 p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"/></div>
      </div>
      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5">Amount (XAF)</label>
        <input type="number" min={MIN_TOPUP} step="1" value={amount} onChange={e=>setAmount(e.target.value)} placeholder={`Minimum ${MIN_TOPUP}`} className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"/>
      </div>
      {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl mb-3 flex items-start gap-2"><AlertCircle size={13} className="shrink-0 mt-0.5"/>{errorMsg}</div>}
      <button onClick={submit} disabled={busy||!amount||!phone} className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50">{busy?'Processing…':'Continue to Mobile Money'}</button>
    </div>
  );
}
