import { useEffect, useRef, useState } from 'react';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Request } from '../lib/d1Api';
import { useNavigate } from 'react-router-dom';
import {
  MobileMoneyMethod,
  METHOD_LABELS,
  payForSubscription,
} from '../utils/payForSubscription';
import { Check, X, Sparkles, Zap, Shield, Store, Crown, Wallet, Link2 } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { PaymentMethodLogo } from '../components/PaymentMethodLogo';

const METHOD_KEYS: Record<MobileMoneyMethod, 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money' | null> = {
  mtn: 'mtn_momo',
  orange: 'orange_money',
  airtel: 'airtel_money',
  moov: 'moov_money',
  wallet: null,
};

export default function Subscribe() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [methods, setMethods] = useState<MobileMoneyMethod[]>(['wallet']);
  const [subscriptionFee, setSubscriptionFee] = useState(3000);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const user = await getCachedUser();
      if (!user) return;
      setUserId(user.id);

      const [userRes, walletRes, profileRes, optionsRes] = await Promise.all([
        supabaseWorkerRequest<{ data: { is_subscribed: boolean } }>('/api/v1/me/profile'),
        supabaseWorkerRequest<{ data: { available_funds: number } | null }>('/api/v1/wallet'),
        d1Request<{ data: { phone?: string; momo_number?: string } }>('/api/me/personal-details'),
        supabaseWorkerRequest<{ data: { plan_price?: number; options?: Array<{ payment_method: string }> } }>('/api/v1/subscriptions/options').catch(() => ({ data: { plan_price: 3000, options: [] } })),
      ]);

      if (userRes.data) setIsSubscribed(userRes.data.is_subscribed);
      if (walletRes.data) setWalletBalance(walletRes.data.available_funds);
      setPaymentPhone(profileRes.data?.momo_number || profileRes.data?.phone || '');
      setSubscriptionFee(Number(optionsRes.data?.plan_price) || 3000);
      const methodMap: Record<string, MobileMoneyMethod> = { MTN_MOMO: 'mtn', ORANGE_MONEY: 'orange', AIRTEL_MONEY: 'airtel', MOOV_MONEY: 'moov' };
      const configured = (optionsRes.data?.options || []).map(option => methodMap[option.payment_method]).filter((method): method is MobileMoneyMethod => Boolean(method));
      setMethods([...new Set<MobileMoneyMethod>([...configured, 'wallet'])]);
    };
    load();
  }, []);

  const handleSubscribe = async (method: MobileMoneyMethod) => {
    if (!userId) return alert('Please log in.');
    if (method !== 'wallet' && !paymentPhone.trim()) return alert('Add a mobile money phone number to your profile before continuing.');
    setLoading(method);
    const key = idempotencyKey.current || (idempotencyKey.current = crypto.randomUUID());
    const result = await payForSubscription(method, paymentPhone, key);
    if (!result.success) {
      alert('Error: ' + result.error);
      if (!/uncertain|already submitted/i.test(result.error || '')) idempotencyKey.current = null;
    } else if (result.paymentUrl) {
      setPendingPaymentId(result.paymentId || null);
      window.location.href = result.paymentUrl;
    } else if (result.pending) {
      setPendingPaymentId(result.paymentId || null);
      alert('Payment request sent. Approve it on your phone, then check the payment status here.');
    } else {
      idempotencyKey.current = null;
      setIsSubscribed(true);
      alert('Premium membership activated successfully.');
      navigate('/home');
    }
    setLoading(null);
  };

  const checkSubscriptionStatus = async () => {
    if (!pendingPaymentId) return;
    setLoading('status');
    try {
      const result = await supabaseWorkerRequest<{ data: { status: string; activation_error?: string | null } }>('/api/v1/subscriptions/' + encodeURIComponent(pendingPaymentId));
      if (result.data.status === 'succeeded' && !result.data.activation_error) {
        setIsSubscribed(true);
        setPendingPaymentId(null);
        idempotencyKey.current = null;
        alert('Payment confirmed. Premium membership is active.');
        navigate('/home');
      } else if (result.data.status === 'failed') {
        setPendingPaymentId(null);
        idempotencyKey.current = null;
        alert('The provider reported that the payment failed. You can try again.');
      } else if (result.data.status === 'needs_review' || result.data.activation_error) {
        alert('Payment needs review. Please contact CenPaya support before trying again.');
      } else {
        alert('Payment is still pending. Approve the request on your phone and check again.');
      }
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Could not check payment status.');
    } finally {
      setLoading(null);
    }
  };

  if (isSubscribed) {
    return (
      <div className="px-3 py-3 pb-24">
        <div className="bg-gradient-to-br from-brand to-brand-dark p-5 rounded-2xl shadow-lg text-white text-center">
          <Crown size={30} className="mx-auto mb-2 text-accent-light" />
          <p className="text-base font-black">You're a Premium Member</p>
          <p className="text-[10px] text-white/80 mt-1">
            Enjoy reduced fees, verified badge, referral earnings, and priority support.
          </p>
        </div>

        <div className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm mt-3">
          <p className="text-xs font-bold text-navy dark:text-white mb-2">Your Benefits</p>
          {[
            'Reduced marketplace fees (3% + 25 XAF)',
            'Verified seller badge on your profile',
            'Earn 1,000 XAF per referred subscriber (vs 500 XAF for free members)',
            'Free monthly listing boosts',
            'Priority customer support',
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 border-b border-gray-50 dark:border-darkline last:border-b-0">
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

  return (
    <div className="px-3 py-3 pb-24">
      <h1 className="text-base font-bold text-navy dark:text-white mb-1">Upgrade to Premium</h1>
      <p className="text-[10px] text-gray-500 mb-3">
        Unlock lower fees and powerful features on CenPaya.
      </p>

      <div className="bg-gradient-to-br from-brand to-brand-dark p-5 rounded-2xl shadow-lg shadow-brand/30 text-white mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={13} className="text-accent-light" />
          <p className="text-[9px] font-bold text-accent-light uppercase tracking-widest">Premium Plan</p>
        </div>
        <p className="text-2xl font-black">
          {subscriptionFee.toLocaleString()} <span className="text-sm">XAF</span>
        </p>
        <p className="text-[10px] text-white/70 mt-1">One-time yearly payment</p>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-3 overflow-hidden">
        <div className="p-2.5 border-b border-gray-100 dark:border-darkline">
          <p className="text-xs font-bold text-navy dark:text-white">What you unlock</p>
        </div>
        <BenefitItem icon={<Store size={14} />} title="Reduced marketplace fees" desc="3% + 25 XAF instead of 5% + 50 XAF." />
        <BenefitItem icon={<Shield size={14} />} title="Verified seller badge" desc="Build buyer trust with a check mark on your profile." />
        <BenefitItem
          icon={<Link2 size={14} />}
          title="Earn more from referrals"
          desc="Premium members earn 1,000 XAF per referred subscriber. Free members earn 500 XAF."
        />
        <BenefitItem icon={<Zap size={14} />} title="Free monthly boosts" desc="Promote one listing per month at no cost." />
      </div>

      <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-3 overflow-hidden">
        <div className="p-2.5 border-b border-gray-100 dark:border-darkline">
          <p className="text-xs font-bold text-navy dark:text-white">Free vs Premium</p>
        </div>
        <div className="flex items-center px-3 py-1.5 border-b border-gray-50 dark:border-darkline bg-gray-50 dark:bg-darkbg">
          <p className="flex-1 text-[9px] font-bold text-gray-500 uppercase">Feature</p>
          <p className="w-12 text-center text-[9px] font-bold text-gray-500 uppercase">Free</p>
          <p className="w-12 text-center text-[9px] font-bold text-accent uppercase">Pro</p>
        </div>
        <ComparisonRow feature="List products" free={true} premium={true} />
        <ComparisonRow feature="Reduced fees (3%+25)" free={false} premium={true} />
        <ComparisonRow feature="Verified badge" free={false} premium={true} />
        <ComparisonRow feature="Referral bonus" free={true} premium={true} note="500 vs 1,000 XAF" />
        <ComparisonRow feature="Free monthly boosts" free={false} premium={true} />
      </div>

      <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm overflow-hidden">
        <p className="p-3 text-xs font-bold text-navy dark:text-white border-b border-gray-100 dark:border-darkline">
          Choose your payment method
        </p>

        <div className="flex items-center px-3 py-2 border-b border-gray-100 dark:border-darkline bg-gray-50 dark:bg-darkbg">
          <p className="flex-1 text-[9px] font-bold text-gray-500 uppercase tracking-wider">Method</p>
          <p className="w-16 text-right text-[9px] font-bold text-gray-500 uppercase tracking-wider">Fee</p>
          <p className="w-8"></p>
        </div>

        {methods.map((m) => {
          const logoKey = METHOD_KEYS[m];
          return (
            <button
              key={m}
              onClick={() => handleSubscribe(m)}
              disabled={loading !== null}
              className="w-full flex items-center px-3 py-3 border-b border-gray-50 dark:border-darkline last:border-b-0 active:bg-gray-50 dark:active:bg-darkbg disabled:opacity-50"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {logoKey ? (
                  <PaymentMethodLogo method={logoKey} size={32} />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-white">
                    <Wallet size={16} />
                  </div>
                )}
                <div className="text-left min-w-0">
                  <p className="text-[12px] font-bold text-navy dark:text-white truncate">
                    {METHOD_LABELS[m]}
                  </p>
                  {m === 'wallet' && walletBalance > 0 && (
                    <p className="text-[9px] text-gray-500">
                      Balance: {walletBalance.toLocaleString()} XAF
                    </p>
                  )}
                </div>
              </div>
              <p className="w-16 text-right text-[11px] font-bold text-gray-600 dark:text-gray-300">
                0%
              </p>
              <p className="w-8 text-right text-accent font-bold">
                {loading === m ? '…' : '→'}
              </p>
            </button>
          );
        })}
      </div>

      {pendingPaymentId && (
        <button onClick={checkSubscriptionStatus} disabled={loading !== null} className="w-full mt-3 bg-brand text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50">
          {loading === 'status' ? 'Checking payment…' : 'Check mobile money payment status'}
        </button>
      )}

      <p className="text-[9px] text-gray-400 text-center mt-3">
        Subscription renews yearly. Cancel anytime from Settings.
      </p>
    </div>
  );
}

function BenefitItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="p-2.5 border-b border-gray-50 dark:border-darkline last:border-b-0 flex gap-2.5">
      <div className="w-7 h-7 bg-accent/10 text-accent rounded-lg flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-[11px] font-bold text-navy dark:text-white">{title}</p>
        <p className="text-[9px] text-gray-500 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function ComparisonRow({
  feature, free, premium, note,
}: { feature: string; free: boolean; premium: boolean; note?: string }) {
  return (
    <div className="flex items-center px-3 py-2 border-b border-gray-50 dark:border-darkline last:border-b-0">
      <div className="flex-1">
        <p className="text-[10px] text-gray-700 dark:text-gray-200">{feature}</p>
        {note && <p className="text-[9px] text-gray-400">{note}</p>}
      </div>
      <div className="w-12 text-center">
        {free ? <Check size={12} className="mx-auto text-green-500" /> : <X size={12} className="mx-auto text-gray-300" />}
      </div>
      <div className="w-12 text-center">
        {premium ? <Check size={12} className="mx-auto text-accent" /> : <X size={12} className="mx-auto text-gray-300" />}
      </div>
    </div>
  );
    }
