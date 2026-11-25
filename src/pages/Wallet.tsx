import { useEffect, useState } from 'react';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Me } from '../lib/d1Api';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowDownToLine, ArrowUpFromLine, Send, Headphones, MessageCircle, ChevronRight, Phone, Clock } from 'lucide-react';
import { PaymentMethodLogo } from '../components/PaymentMethodLogo';
import Select from '../components/Select';
import { useI18n } from '../contexts/i18n';

type Method = 'mtn_momo' | 'orange_money';
const METHODS: Method[] = ['mtn_momo', 'orange_money'];

const METHOD_LABELS: Record<Method, string> = {
  mtn_momo: 'MTN MoMo',
  orange_money: 'Orange Money',
};

export default function Wallet() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [wallet, setWallet] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [escrow, setEscrow] = useState<any>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  const [momoNumber, setMomoNumber] = useState('');
  const [momoProvider, setMomoProvider] = useState<Method | ''>('');
  const [momoCountry, setMomoCountry] = useState('CM');
  const [savingMomo, setSavingMomo] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { user } = await d1Me();
      if (!user) { setLoading(false); return; }

      const [walletRes, prefsRes] = await Promise.all([
        supabaseWorkerRequest<{ data: any }>('/api/v1/wallet'),
        supabaseWorkerRequest<{ data: { profile: any; countries: any[] } }>('/api/v1/me/payment-preferences'),
      ]);

      const profile = prefsRes.data?.profile || {};
      const configuredCountries = (prefsRes.data?.countries || []).map((country: any) => ({
        code: country.country_iso,
        name: country.name,
        phone_prefix: country.phone_prefix,
        enabled_methods: Array.isArray(country.enabled_methods) ? country.enabled_methods : METHODS,
      }));
      setWallet(walletRes.data);
      setUser({ ...user, ...profile });
      setEscrow(walletRes.data?.escrow_summary || null);
      setCountries(configuredCountries);

      if (profile.momo_number) setMomoNumber(String(profile.momo_number));
      else if (profile.phone) setMomoNumber(String(profile.phone));
      if (profile.momo_provider && METHODS.includes(profile.momo_provider as Method)) setMomoProvider(profile.momo_provider as Method);
      if (profile.country_iso) setMomoCountry(profile.country_iso);
      setLoading(false);
    };
    load();
  }, []);

  const saveMomo = async () => {
    setSavingMomo(true);
    const { user } = await d1Me();
    if (!user) { setSavingMomo(false); return; }
    try {
      const prefix = countries.find((country) => country.code === momoCountry)?.phone_prefix || '';
      const result = await supabaseWorkerRequest<{ data: any }>('/api/v1/me/payment-preferences', {
        method: 'PATCH',
        body: JSON.stringify({ country_iso: momoCountry, momo_number: `${prefix} ${momoNumber.trim()}`, momo_provider: momoProvider }),
      });
      if (result.data?.ok === false) throw new Error(result.data.error || 'Could not save payment details.');
      setUser({ ...user, momo_number: `${prefix} ${momoNumber.trim()}`, momo_provider: momoProvider, country_iso: momoCountry });
      alert('MoMo details saved');
    } catch (error: any) {
      alert(error.message || 'Could not save MoMo details.');
    } finally {
      setSavingMomo(false);
    }
  };

  if (loading) {
    return (
      <div className="px-3 py-3 pb-24">
        <div className="h-40 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
      </div>
    );
  }
  if (!wallet) return <div className="p-4 text-center text-xs">No wallet found.</div>;

  const balance = wallet.available_funds || 0;
  const referrals = wallet.referral_earnings_available || 0;
  const selectedCountry = countries.find((c) => c.code === momoCountry);

  return (
    <div className="pb-24">
      <div className="px-4 pt-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-base">
          {user?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-bold text-navy dark:text-white">Wallet · @{user?.username || 'You'}</p>
          <span className="inline-block mt-0.5 text-[9px] font-bold bg-accent/15 text-accent px-2 py-0.5 rounded-full uppercase tracking-wider">
            {user?.country_iso || 'CM'}
          </span>
        </div>
      </div>

      <div className="mx-3 mt-4 bg-gradient-to-br from-brand to-brand-dark text-white rounded-2xl p-4 shadow-brand">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[10px] text-white/70 uppercase tracking-widest">Available Balance</p>
            <p className="text-[26px] font-black mt-1 tabular-nums">
              {hidden ? '••••••' : balance.toLocaleString()}
              <span className="text-sm ml-1 opacity-70">XAF</span>
            </p>
          </div>
          <button onClick={() => setHidden(v => !v)} className="text-white/80 p-1 cursor-pointer">
            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={() => navigate('/wallet/topup')}
            className="flex-1 bg-white text-brand font-bold text-[11px] py-2.5 rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
          >
            <ArrowUpFromLine size={13} /> Top Up
          </button>
          <button
            onClick={() => navigate('/withdraw')}
            className="flex-1 bg-accent text-white font-bold text-[11px] py-2.5 rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
          >
            <ArrowDownToLine size={13} /> Withdraw
          </button>
        </div>
      </div>

      {escrow && escrow.orders_in_escrow > 0 && (
        <div className="mx-3 mt-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-3 flex items-start gap-3">
          <Clock size={18} className="text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[11px] font-bold text-yellow-800 dark:text-yellow-200">
              {Number(escrow.amount_in_escrow).toLocaleString()} XAF held in escrow
            </p>
            <p className="text-[9px] text-yellow-700 dark:text-yellow-300 mt-0.5">
              {escrow.next_auto_release_at
                ? `Auto-releases ${new Date(escrow.next_auto_release_at).toLocaleString()}`
                : 'Auto-releases 72h after delivery'}
            </p>
          </div>
        </div>
      )}

      <div className="mx-3 mt-3 bg-white dark:bg-darkcard rounded-2xl p-3 shadow-sm">
        <div className="flex justify-between items-center mb-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Referrals</p>
          <button onClick={() => navigate('/referrals')} className="text-[10px] font-bold text-accent cursor-pointer">
            See more →
          </button>
        </div>
        <p className="text-[18px] font-black text-navy dark:text-white tabular-nums">
          {referrals.toLocaleString()} <span className="text-[11px] opacity-60">XAF</span>
        </p>
        <p className="text-[9px] text-gray-400 mt-0.5">
          Locked: {wallet.referral_pending_lock.toLocaleString()} · Received: {wallet.referral_received_locked.toLocaleString()}
        </p>
      </div>

      <div className="mx-3 mt-3 bg-white dark:bg-darkcard rounded-2xl p-3 shadow-sm">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
          {t('payment_method')}
        </p>

        <Select
          label="Country"
          value={momoCountry}
          onChange={setMomoCountry}
          options={countries.map(c => ({
            value: c.code,
            label: `${c.name} (${c.phone_prefix})`,
          }))}
          placeholder="Choose country"
        />

        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 mt-3 flex items-center gap-1">
          <Phone size={11} /> MoMo Number
        </p>
        <div className="flex gap-2 mb-3">
          <div className="px-3 py-2.5 bg-gray-100 dark:bg-darkline rounded-lg text-xs font-bold text-navy dark:text-white shrink-0">
            {selectedCountry?.phone_prefix || '+237'}
          </div>
          <input
            type="tel"
            value={momoNumber.replace(/^\+\d+\s?/, '')}
            onChange={(e) => setMomoNumber(e.target.value.replace(/\D/g, ''))}
            placeholder="6XX XXX XXX"
            className="flex-1 p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
          />
        </div>

        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5">Provider</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {METHODS.filter(m => (selectedCountry?.enabled_methods || METHODS).includes(m)).map((m) => (
            <button
              key={m}
              onClick={() => setMomoProvider(m)}
              className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 cursor-pointer ${
                momoProvider === m ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
              }`}
            >
              <PaymentMethodLogo method={m} size={28} />
            </button>
          ))}
        </div>

        <button
          onClick={saveMomo}
          disabled={!momoNumber.trim() || !momoProvider || savingMomo || !METHODS.includes(momoProvider)}
          className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[11px] disabled:opacity-40 cursor-pointer"
        >
          {savingMomo ? 'Saving...' : momoNumber ? 'Update MoMo details' : 'Save MoMo details'}
        </button>
      </div>

      <div className="mx-3 mt-4">
        <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2">Community</p>
        <button
          onClick={() => window.open('https://wa.me/237653931300', '_blank')}
          className="w-full bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3 active:bg-gray-50 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-green-500 text-white flex items-center justify-center">
            <MessageCircle size={14} />
          </div>
          <span className="flex-1 text-left text-[11px] font-bold text-navy dark:text-white">WhatsApp</span>
          <ChevronRight size={14} className="text-gray-400" />
        </button>
        <button
          onClick={() => navigate('/contact-admin')}
          className="w-full bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3 active:bg-gray-50 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-navy text-white flex items-center justify-center">
            <Headphones size={14} />
          </div>
          <span className="flex-1 text-left text-[11px] font-bold text-navy dark:text-white">Contact Admin</span>
          <ChevronRight size={14} className="text-gray-400" />
        </button>
        <button
          onClick={() => window.open('mailto:samuelsenviter589@gmail.com', '_blank')}
          className="w-full bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3 active:bg-gray-50 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-red-500 text-white flex items-center justify-center">
            <Send size={14} />
          </div>
          <span className="flex-1 text-left text-[11px] font-bold text-navy dark:text-white">Email Support</span>
          <ChevronRight size={14} className="text-gray-400" />
        </button>
      </div>
    </div>
  );
        }
