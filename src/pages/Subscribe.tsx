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
  const [subscriptionCurrency, setSubscriptionCurrency] = useState('XAF');
  const [paymentOptions, setPaymentOptions] = useState<Array<{ provider: string; payment_method: string; gross_amount: number; gateway_fee: number }>>([]);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setPageLoading(true);
      setPageError('');
      try {
        const user = await getCachedUser();
        if (!user) throw new Error('Please sign in to view membership options.');
        if (active) setUserId(user.id);
        const [userRes, walletRes, profileRes, optionsRes] = await Promise.all([
          supabaseWorkerRequest<{ data: { is_subscribed: boolean } }>('/api/v1/me/profile'),
          supabaseWorkerRequest<{ data: { available_funds: number } | null }>('/api/v1/wallet'),
          supabaseWorkerRequest<{ data: { profile: any; countries: any[] } }>('/api/v1/me/payment-preferences'),
          supabaseWorkerRequest<{ data: { plan_price?: number; currency?: string; options?: Array<{ provider: string; payment_method: string; gross_amount: number; gateway_fee: number }> } }>('/api/v1/subscriptions/options'),
        ]);
        if (!active) return;
        if (userRes.data) setIsSubscribed(!!userRes.data.is_subscribed);
        if (walletRes.data) setWalletBalance(Number(walletRes.data.available_funds || 0));
        const profile = profileRes.data?.profile || {};
        setPaymentPhone(profile.momo_number || profile.phone || '');
        setSubscriptionFee(Number(optionsRes.data?.plan_price) || 3000);
        setSubscriptionCurrency(optionsRes.data?.currency || 'XAF');
        const options = optionsRes.data?.options || [];
        setPaymentOptions(options);
        const methodMap: Record<string, MobileMoneyMethod> = { MTN_MOMO: 'mtn', ORANGE_MONEY: 'orange', AIRTEL_MONEY: 'airtel', MOOV_MONEY: 'moov' };
        const configured = options.map(option => methodMap[option.payment_method]).filter((method): method is MobileMoneyMethod => Boolean(method));
        setMethods([...new Set<MobileMoneyMethod>([...configured, 'wallet'])]);
      } catch (error:any) {
        if (active) setPageError(error.message || 'Could not load subscription options.');
      } finally {
        if (active) setPageLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const handleSubscribe = async (method: MobileMoneyMethod) => {
    if (!userId) return alert('Please log in.');
    setLoading(method);
    const key = idempotencyKey.current || (idempotencyKey.current = crypto.randomUUID());
    if (method !== 'wallet' && !paymentPhone.trim()) {
      setPageError('Enter your Mobile Money number before continuing.');
      setLoading(null);
      return;
    }
    if (method === 'wallet' && walletBalance < subscriptionFee) {
      setPageError('Your wallet balance is not enough. Top up your wallet first.');
      setLoading(null);
      return;
    }
    const result = await payForSubscription(method, paymentPhone, key);
    if (!result.success) {
      setPageError(result.error || 'Subscription payment failed.');
      if (!/uncertain|already submitted/i.test(result.error || '')) idempotencyKey.current = null;
    } else if (result.paymentUrl) {
      setPendingPaymentId(result.paymentId || null);
      window.location.href = result.paymentUrl;
      return;
    } else if (result.pending) {
      setPendingPaymentId(result.paymentId || null);
      setActionMessage('Payment request sent. Approve the prompt on your phone, then check its status below.');
    } else {
      idempotencyKey.current = null;
      setIsSubscribed(true);
      setPendingPaymentId(null);
      setActionMessage('Premium membership activated successfully.');
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
        setActionMessage('Payment confirmed. Premium membership is active.');
        navigate('/home');
      } else if (result.data.status === 'failed') {
        setPendingPaymentId(null);
        idempotencyKey.current = null;
        setPageError('The provider reported that the payment failed. You can try again.');
      } else if (result.data.status === 'needs_review' || result.data.activation_error) {
        setPageError('Payment needs review. Please contact CenPaya support before trying again.');
      } else {
        setActionMessage('Payment is still pending. Approve the request on your phone and check again.');
      }
    } catch (error: unknown) {
      setPageError(error instanceof Error ? error.message : 'Could not check payment status.');
    } finally {
      setLoading(null);
    }
  };

  if (pageLoading) return <div className="p-5 text-center text-xs text-gray-500">Loading membership…</div>;

  if (isSubscribed) {
    return (
      <div className="px-3 py-3 pb-24">
        <div className="bg-gradient-to-br from-brand to-brand-dark p-5 rounded-2xl shadow-lg text-white text-center">
          <Crown size={30} className="mx-auto mb-2 text-accent-light" />
          <p className="text-base font-black">You're a Premium Member</p>
          <p className="text-[10px] text-white/80 mt-1">
            Enjoy reduced fees, verified membership, free monthly boosts, and priority support.
          </p>
        </div>

        <div className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm mt-3">
          <p className="text-xs font-bold text-navy dark:text-white mb-2">Your Benefits</p>
          {[
            'Reduced marketplace fees (3% + 25 XAF)',
            'Verified seller badge on your profile',
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
      {pageError && <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 text-[10px]">{pageError}</div>}
      {actionMessage && <div className="mb-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 text-[10px]">{actionMessage}</div>}
      <p className="text-[10px] text-gray-500 mb-3">
        Unlock lower fees and powerful features on CenPaya.
      </p>

      <div className="bg-gradient-to-br from-brand to-brand-dark p-5 rounded-2xl shadow-lg shadow-brand/30 text-white mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={13} className="text-accent-light" />
          <p className="text-[9px] font-bold text-accent-light uppercase tracking-widest">Premium Plan</p>
        </div>
        <p className="text-2xl font-black">
          {subscriptionFee.toLocaleString()} <span className="text-sm">{subscriptionCurrency}</span>
        </p>
        <p className="text-[10px] text-white/70 mt-1">One-time yearly payment</p>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-3 overflow-hidden">
        <div className="p-2.5 border-b border-gray-100 dark:border-darkline">
          <p className="text-xs font-bold text-navy dark:text-white">What you unlock</p>
        </div>
        <BenefitItem icon={<Store size={14} />} title="Reduced marketplace fees" desc="3% + 25 XAF instead of 5% + 50 XAF." />
        <BenefitItem icon={<Shield size={14} />} title="Verified seller badge" desc="Build buyer trust with a check mark on your profile." />
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
        <ComparisonRow feature="Free monthly boosts" free={false} premium={true} />
      </div>

      <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm overflow-hidden mb-3">
        <label className="block p-3 text-[10px] font-bold text-gray-600 dark:text-gray-300">Mobile Money number</label>
        <input type="tel" value={paymentPhone} onChange={e=>setPaymentPhone(e.target.value)} placeholder="+237 6XX XXX XXX" autoComplete="tel" className="mx-3 mb-3 w-[calc(100%-24px)] p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs" />
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
          const option = paymentOptions.find(item => item.payment_method === logoKey);
          const gatewayFee = m === 'wallet' ? 0 : Number(option?.gateway_fee || 0);
          const grossAmount = m === 'wallet' ? subscriptionFee : Number(option?.gross_amount || subscriptionFee);
          return (
            <button
              key={m}
              onClick={() => handleSubscribe(m)}
              disabled={loading !== null || (m === 'wallet' && walletBalance < subscriptionFee)}
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
                    <p className="text-[9px] text-gray-500">Balance: {walletBalance.toLocaleString()} XAF</p>
                  )}
                </div>
              </div>
              <div className="w-20 text-right"><p className="text-[11px] font-bold text-gray-600 dark:text-gray-300">{gatewayFee.toLocaleString()} XAF</p><p className="text-[8px] text-gray-400">Total {grossAmount.toLocaleString()}</p></div>
              <p className="w-8 text-right text-accent font-bold">
                {loading === m ? '…' : '→'}
              </p>
            </button>
          );
        })}
      </div>

      {methods.includes('wallet') && walletBalance < subscriptionFee && <button onClick={()=>navigate('/wallet/topup')} className="w-full mt-3 text-xs font-bold text-brand">Top up your wallet to subscribe</button>}

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
