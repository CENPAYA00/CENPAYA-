import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { SubscriptionProvider, payForSubscription } from '../utils/payForSubscription';
import { Check, X, Sparkles, Zap, Shield, Video, Store, Users, Crown } from 'lucide-react';

const PROVIDERS: { key: SubscriptionProvider; label: string; color: string }[] = [
  { key: 'campay', label: 'Campay', color: 'bg-blue-500' },
  { key: 'fapshi', label: 'Fapshi', color: 'bg-purple-500' },
  { key: 'cinetpay', label: 'CinetPay', color: 'bg-green-500' },
  { key: 'pawapay', label: 'PawaPay', color: 'bg-orange-500' },
  { key: 'wallet', label: 'Wallet', color: 'bg-gray-700' },
];

export default function Subscribe() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const SUBSCRIPTION_FEE = 3000;

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const [userRes, walletRes] = await Promise.all([
        supabase.from('users').select('is_subscribed').eq('id', user.id).single(),
        supabase.from('wallets').select('available_funds').eq('user_id', user.id).single(),
      ]);

      if (userRes.data) setIsSubscribed(userRes.data.is_subscribed);
      if (walletRes.data) setWalletBalance(walletRes.data.available_funds);
    };
    load();
  }, []);

  const handleSubscribe = async (provider: SubscriptionProvider) => {
    if (!userId) return alert('Please log in.');
    setLoading(provider);

    const result = await payForSubscription(userId, provider, SUBSCRIPTION_FEE);

    if (!result.success) {
      alert('Error: ' + result.error);
    } else if (result.paymentUrl) {
      window.location.href = result.paymentUrl;
    } else {
      alert('Subscription successful!');
      navigate('/home');
    }
    setLoading(null);
  };

  // Already subscribed
  if (isSubscribed) {
    return (
      <div className="px-3 py-3 pb-24">
        <div className="bg-gradient-to-br from-brand to-brand-dark p-5 rounded-2xl shadow-lg text-white text-center">
          <Crown size={30} className="mx-auto mb-2 text-accent-light" />
          <p className="text-base font-black">You're a Premium Member</p>
          <p className="text-[10px] text-white/80 mt-1">
            Enjoy reduced fees, verified badge, video posts, and priority support.
          </p>
        </div>

        <div className="bg-white p-3 rounded-xl shadow-sm mt-3">
          <p className="text-xs font-bold text-navy mb-2">Your Benefits</p>
          {[
            'Reduced marketplace fees (3% + 25 XAF)',
            'Verified seller badge on your profile',
            'Video posts and reels enabled',
            'Free monthly listing boosts',
            'Priority customer support',
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 text-[11px] text-gray-700 border-b border-gray-50 last:border-b-0">
              <Check size={13} className="text-green-500 shrink-0" /> {b}
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/home')}
          className="w-full bg-brand text-white font-bold py-2.5 rounded-lg text-xs mt-3"
        >
          Back to Home
        </button>
      </div>
    );
  }

  // Not subscribed
  return (
    <div className="px-3 py-3 pb-24">
      <h1 className="text-base font-bold text-navy mb-1">Upgrade to Premium</h1>
      <p className="text-[10px] text-gray-500 mb-3">
        Unlock lower fees and powerful features on CenPaya.
      </p>

      {/* Price hero */}
      <div className="bg-gradient-to-br from-brand to-brand-dark p-5 rounded-2xl shadow-lg shadow-brand/30 text-white mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={13} className="text-accent-light" />
          <p className="text-[9px] font-bold text-accent-light uppercase tracking-widest">
            Premium Plan
          </p>
        </div>
        <p className="text-2xl font-black">
          {SUBSCRIPTION_FEE.toLocaleString()} <span className="text-sm">XAF</span>
        </p>
        <p className="text-[10px] text-white/70 mt-1">One-time yearly payment</p>
      </div>

      {/* Benefits list */}
      <div className="bg-white rounded-xl shadow-sm mb-3 overflow-hidden">
        <div className="p-2.5 border-b border-gray-100">
          <p className="text-xs font-bold text-navy">What you unlock</p>
        </div>
        <BenefitItem
          icon={<Store size={14} />}
          title="Reduced marketplace fees"
          desc="3% + 25 XAF instead of 5% + 50 XAF. Save on every sale."
        />
        <BenefitItem
          icon={<Shield size={14} />}
          title="Verified seller badge"
          desc="Build buyer trust with a verification mark on your profile."
        />
        <BenefitItem
          icon={<Video size={14} />}
          title="Video posts and reels"
          desc="Sell more with video listings and reels in the social feed."
        />
        <BenefitItem
          icon={<Zap size={14} />}
          title="Free monthly boosts"
          desc="Promote one listing per month at no extra cost."
        />
        <BenefitItem
          icon={<Users size={14} />}
          title="Priority support"
          desc="Get faster responses from CenPaya support."
        />
      </div>

      {/* Free vs Premium comparison */}
      <div className="bg-white rounded-xl shadow-sm mb-3 overflow-hidden">
        <div className="p-2.5 border-b border-gray-100">
          <p className="text-xs font-bold text-navy">Free vs Premium</p>
        </div>
        <div className="flex items-center px-3 py-1.5 border-b border-gray-50 bg-gray-50">
          <p className="flex-1 text-[9px] font-bold text-gray-500 uppercase">Feature</p>
          <p className="w-12 text-center text-[9px] font-bold text-gray-500 uppercase">Free</p>
          <p className="w-12 text-center text-[9px] font-bold text-accent uppercase">Pro</p>
        </div>
        <ComparisonRow feature="List products" free={true} premium={true} />
        <ComparisonRow feature="Reduced fees (3%+25)" free={false} premium={true} />
        <ComparisonRow feature="Verified badge" free={false} premium={true} />
        <ComparisonRow feature="Video posts and reels" free={false} premium={true} />
        <ComparisonRow feature="Free monthly boosts" free={false} premium={true} />
        <ComparisonRow feature="Priority support" free={false} premium={true} />
      </div>

      {/* Payment providers */}
      <div className="bg-white p-3 rounded-xl shadow-sm">
        <p className="text-xs font-bold text-navy mb-2">Choose payment method</p>
        {walletBalance > 0 && (
          <p className="text-[10px] text-gray-500 mb-2">
            Wallet balance: {walletBalance.toLocaleString()} XAF
          </p>
        )}
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            onClick={() => handleSubscribe(p.key)}
            disabled={loading !== null}
            className="w-full flex items-center justify-between p-2.5 mb-1.5 rounded-lg border border-gray-200 active:scale-[0.98] disabled:opacity-50"
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 ${p.color} rounded-lg flex items-center justify-center text-white text-[10px] font-bold`}>
                {p.label.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-navy">{p.label}</span>
            </div>
            <span className="text-accent font-bold text-sm">
              {loading === p.key ? '...' : '→'}
            </span>
          </button>
        ))}
      </div>

      <p className="text-[9px] text-gray-400 text-center mt-3">
        Subscription renews yearly. Cancel anytime from Settings.
      </p>
    </div>
  );
}

function BenefitItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="p-2.5 border-b border-gray-50 last:border-b-0 flex gap-2.5">
      <div className="w-7 h-7 bg-accent/10 text-accent rounded-lg flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-[11px] font-bold text-navy">{title}</p>
        <p className="text-[9px] text-gray-500 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function ComparisonRow({ feature, free, premium }: { feature: string; free: boolean; premium: boolean }) {
  return (
    <div className="flex items-center px-3 py-2 border-b border-gray-50 last:border-b-0">
      <p className="flex-1 text-[10px] text-gray-700">{feature}</p>
      <div className="w-12 text-center">
        {free ? <Check size={12} className="mx-auto text-green-500" /> : <X size={12} className="mx-auto text-gray-300" />}
      </div>
      <div className="w-12 text-center">
        {premium ? <Check size={12} className="mx-auto text-accent" /> : <X size={12} className="mx-auto text-gray-300" />}
      </div>
    </div>
  );
            }
