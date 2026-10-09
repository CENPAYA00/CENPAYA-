import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { SubscriptionProvider, payForSubscription } from '../utils/payForSubscription';

const PROVIDERS: { key: SubscriptionProvider; label: string; icon: string }[] = [
  { key: 'cinetpay', label: 'CinetPay', icon: '💳' },
  { key: 'campay', label: 'Campay', icon: '📱' },
  { key: 'fapshi', label: 'Fapshi', icon: '💸' },
  { key: 'pawapay', label: 'PawaPay', icon: '🌍' },
  { key: 'flutterwave', label: 'Flutterwave', icon: '🌐' },
  { key: 'wallet', label: 'Pay from Wallet', icon: '👛' },
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

  if (isSubscribed) {
    return (
      <div className="p-4 bg-offwhite min-h-screen pb-20">
        <div className="bg-brand text-white p-6 rounded-3xl text-center">
          <h1 className="text-2xl font-black mb-2">✅ You're a Premium Member</h1>
          <p className="text-sm text-accent-light">
            You have access to all premium features and reduced marketplace fees.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      <h1 className="text-3xl font-black text-navy mb-2">Upgrade to Premium</h1>
      <p className="text-sm text-gray-500 mb-5">Unlock reduced fees, video posts, and more.</p>

      <div className="bg-gradient-to-br from-brand to-brand-dark p-6 rounded-3xl shadow-xl mb-6 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-accent-light mb-1">Premium Plan</p>
        <p className="text-4xl font-black mb-2">{SUBSCRIPTION_FEE.toLocaleString()} XAF</p>
        <p className="text-xs text-white/70">One-time yearly payment</p>
      </div>

      <h2 className="font-bold text-navy mb-3">Choose Payment Method</h2>

      {PROVIDERS.map((p) => (
        <button
          key={p.key}
          onClick={() => handleSubscribe(p.key)}
          disabled={loading !== null}
          className="w-full bg-white p-4 rounded-2xl shadow-sm mb-2 flex items-center justify-between active:scale-95 transition-transform disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{p.icon}</span>
            <div className="text-left">
              <p className="font-bold text-navy">{p.label}</p>
              {p.key === 'wallet' && (
                <p className="text-xs text-gray-400">Balance: {walletBalance.toLocaleString()} XAF</p>
              )}
            </div>
          </div>
          <span className="text-gold font-bold">{loading === p.key ? '...' : '→'}</span>
        </button>
      ))}
    </div>
  );
}