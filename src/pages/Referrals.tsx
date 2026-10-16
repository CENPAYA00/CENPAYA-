import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, TrendingUp, Sparkles, Users, Gift, Link2, ArrowDownToLine, Smartphone } from 'lucide-react';
import Select from '../components/Select';
import { PaymentMethodLogo, METHOD_LABELS } from '../components/PaymentMethodLogo';

type ReferralItem = {
  id: string;
  referred_id: string;
  referred_username: string | null;
  points: number;
  status: string;
  created_at: string;
};

type Dashboard = {
  direct_referrals_count: number;
  subscribed_referrals_count: number;
  total_points: number;
  available_earnings: number;
  referrals: ReferralItem[];
};

type Method = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';
const METHODS: Method[] = ['mtn_momo', 'orange_money', 'airtel_money', 'moov_money'];

export default function Referrals() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralLink, setReferralLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [countries, setCountries] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('CM');
  const [provider, setProvider] = useState<Method>('mtn_momo');
  const [phone, setPhone] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      setReferralLink(`https://cenpaya.pages.dev/signup?ref=${user.id.slice(0, 8)}`);

      const [refRes, walletRes, userRes, countriesRes] = await Promise.all([
        supabase
          .from('referrals')
          .select('id, referred_id, points, status, created_at')
          .eq('referrer_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('wallets').select('referral_earnings_available').eq('user_id', user.id).single(),
        supabase.from('users').select('country_iso, phone, momo_number, momo_provider').eq('id', user.id).single(),
        supabase.from('supported_countries').select('code, name, phone_prefix').eq('is_active', true).order('code'),
      ]);

      setCountries(countriesRes.data || []);

      const iso = userRes.data?.country_iso || 'CM';
      setSelectedCountry(iso);
      if (userRes.data?.momo_number) setPhone(userRes.data.momo_number.replace(/^\+\d+\s?/, ''));
      else if (userRes.data?.phone) setPhone(userRes.data.phone.replace(/^\+\d+\s?/, ''));
      if (userRes.data?.momo_provider) setProvider(userRes.data.momo_provider as Method);

      if (!refRes.error && refRes.data) {
        const referrals = refRes.data as ReferralItem[];
        setDashboard({
          direct_referrals_count: referrals.length,
          subscribed_referrals_count: referrals.filter(r => r.status === 'unlocked').length,
          total_points: referrals.reduce((sum, r) => sum + (r.points || 0), 0),
          available_earnings: walletRes.data?.referral_earnings_available || 0,
          referrals,
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Could not copy. Long-press the link to copy manually.');
    }
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    setPrefsSaved(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingPrefs(false); return; }
    const country = countries.find(c => c.code === selectedCountry);
    const prefix = country?.phone_prefix || '+237';
    const fullNumber = `${prefix} ${phone.trim()}`;

    const { error } = await supabase.from('users').update({
      country_iso: selectedCountry,
      momo_number: fullNumber,
      momo_provider: provider,
    }).eq('id', user.id);

    setSavingPrefs(false);
    if (error) { alert(error.message); return; }
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2000);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'unlocked': return 'bg-green-100 text-green-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'locked': return 'bg-gray-100 text-gray-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="px-3 py-3 pb-24 space-y-3">
        <div className="h-28 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse"></div>
        <div className="h-32 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse"></div>
      </div>
    );
  }

  const available = dashboard?.available_earnings || 0;
  const country = countries.find(c => c.code === selectedCountry);
  const prefix = country?.phone_prefix || '+237';

  return (
    <div className="px-3 py-3 pb-24">
      <h1 className="text-base font-bold text-navy dark:text-white mb-3">Referrals</h1>

      <div className="bg-gradient-to-br from-brand to-brand-dark p-4 rounded-2xl shadow-lg shadow-brand/30 mb-3 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-accent/20 rounded-full -mr-12 -mt-12" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={13} className="text-accent-light" />
            <p className="text-[9px] font-bold text-accent-light uppercase tracking-widest">
              Available to withdraw
            </p>
          </div>
          <p className="text-2xl font-black text-white mt-1">
            {available.toLocaleString()}{' '}
            <span className="text-sm text-accent-light">XAF</span>
          </p>
          <p className="text-[9px] text-white/70 mt-1">
            Earn 1,000 XAF per referred subscriber
          </p>

          <button
            onClick={() => navigate('/referral-withdraw')}
            disabled={available < 2000}
            className="mt-3 bg-white text-brand font-bold text-[11px] px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50 active:scale-[0.98] cursor-pointer"
          >
            <ArrowDownToLine size={13} /> Withdraw
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatCard icon={<Users size={12} />} label="Total" value={dashboard?.direct_referrals_count || 0} />
        <StatCard icon={<TrendingUp size={12} />} label="Subscribed" value={dashboard?.subscribed_referrals_count || 0} highlight />
        <StatCard icon={<Gift size={12} />} label="Earned" value={(dashboard?.total_points || 0).toLocaleString()} />
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Link2 size={13} className="text-accent" />
          <p className="text-[11px] font-bold text-navy dark:text-white">Your referral link</p>
        </div>
        <div className="bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-lg p-2 text-[10px] font-mono text-gray-600 dark:text-gray-300 truncate mb-2">
          {referralLink}
        </div>
        <button
          onClick={copyLink}
          className={`w-full py-2.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-2 active:scale-95 cursor-pointer ${
            copied ? 'bg-green-500 text-white' : 'bg-accent text-white'
          }`}
        >
          {copied ? (<><Check size={13} /> Copied!</>) : (<><Copy size={13} /> Copy & Share</>)}
        </button>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <div className="flex items-center gap-2 mb-3">
          <Smartphone size={13} className="text-accent" />
          <p className="text-[11px] font-bold text-navy dark:text-white">Withdrawal preferences</p>
        </div>

        <Select
          label="Country"
          value={selectedCountry}
          onChange={setSelectedCountry}
          options={countries.map(c => ({
            value: c.code,
            label: `${c.name} (${c.phone_prefix})`,
          }))}
          placeholder="Choose country"
        />

        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mt-3 mb-2">Withdrawal method</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {METHODS.map((m) => (
            <button
              key={m}
              onClick={() => setProvider(m)}
              className={`p-2.5 rounded-xl border-2 flex items-center gap-2 cursor-pointer ${
                provider === m ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
              }`}
            >
              <PaymentMethodLogo method={m} size={26} />
              <p className="text-[10px] font-bold text-navy dark:text-white text-left">
                {METHOD_LABELS[m].split(' ')[0]}
              </p>
            </button>
          ))}
        </div>

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5">
          Mobile Money Number
        </label>
        <div className="flex gap-2 mb-3">
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

        <button
          onClick={savePrefs}
          disabled={savingPrefs || !phone.trim()}
          className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-[11px] disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {prefsSaved ? (<><Check size={13} /> Saved</>) : savingPrefs ? 'Saving…' : 'Save preferences'}
        </button>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[11px] font-bold text-navy dark:text-white">Your Referrals</p>
          <p className="text-[9px] text-gray-400">{dashboard?.referrals.length || 0} total</p>
        </div>

        {(!dashboard || dashboard.referrals.length === 0) && (
          <div className="p-5 text-center">
            <div className="w-12 h-12 bg-accent/10 rounded-full mx-auto flex items-center justify-center mb-2">
              <Users size={18} className="text-accent" />
            </div>
            <p className="text-[11px] font-bold text-navy dark:text-white">No referrals yet</p>
            <p className="text-[9px] text-gray-500 mt-1">Share your link to start earning 1,000 XAF per subscriber.</p>
          </div>
        )}

        {dashboard?.referrals.map(ref => (
          <div key={ref.id} className="p-3 flex items-center gap-3 border-b border-gray-50 dark:border-darkline last:border-b-0">
            <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center text-accent font-bold text-[11px]">
              {ref.referred_username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-navy dark:text-white truncate">
                {ref.referred_username ? `@${ref.referred_username}` : `User ${ref.referred_id.slice(0, 6)}`}
              </p>
              <p className="text-[9px] text-gray-400">
                {new Date(ref.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${getStatusStyle(ref.status)}`}>
                {ref.status}
              </span>
              <p className="text-[10px] font-bold text-navy dark:text-white mt-1">{ref.points} XAF</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className={`p-2.5 rounded-xl shadow-sm ${highlight ? 'bg-accent text-white' : 'bg-white dark:bg-darkcard'}`}>
      <div className={`flex items-center gap-1 mb-1 ${highlight ? 'text-white' : 'text-gray-400'}`}>
        {icon}
        <p className={`text-[9px] font-medium ${highlight ? 'text-white/80' : 'text-gray-500'}`}>{label}</p>
      </div>
      <p className={`text-sm font-black ${highlight ? 'text-white' : 'text-navy dark:text-white'}`}>{value}</p>
    </div>
  );
      }
