import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, ArrowDownToLine, ArrowUpFromLine,
  Send, Headphones, MessageCircle, ChevronRight, Plus, Phone, Clock
} from 'lucide-react';
import { PaymentMethodLogo, METHOD_LABELS } from '../components/PaymentMethodLogo';

type Method = 'mtn_momo' | 'orange_money' | 'airtel_money' | 'moov_money';
const METHODS: Method[] = ['mtn_momo', 'orange_money', 'airtel_money', 'moov_money'];

export default function Wallet() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [escrow, setEscrow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [momoNumber, setMomoNumber] = useState('');
  const [momoProvider, setMomoProvider] = useState<Method | ''>('');
  const [savingMomo, setSavingMomo] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [walletRes, userRes, escrowRes] = await Promise.all([
        supabase.from('wallets').select('*').eq('user_id', user.id).single(),
        supabase.from('users').select('username, country_iso, momo_number, momo_provider, is_subscribed').eq('id', user.id).single(),
        supabase.from('buyer_escrow_summary').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      setWallet(walletRes.data);
      setUser(userRes.data);
      setEscrow(escrowRes.data);
      if (userRes.data?.momo_number) setMomoNumber(userRes.data.momo_number);
      if (userRes.data?.momo_provider) setMomoProvider(userRes.data.momo_provider as Method);
      setLoading(false);
    };
    load();
  }, []);

  const saveMomo = async () => {
    setSavingMomo(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingMomo(false); return; }
    await supabase.from('users').update({
      momo_number: momoNumber.trim() || null,
      momo_provider: momoProvider || null,
    }).eq('id', user.id);
    setUser({ ...user, momo_number: momoNumber, momo_provider: momoProvider });
    setSavingMomo(false);
    alert('MoMo details saved');
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

  return (
    <div className="pb-24">
      {/* Greeting */}
      <div className="px-4 pt-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-base">
          {user?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-bold text-navy dark:text-white">
            Wallet · @{user?.username || 'You'}
          </p>
          <span className="inline-block mt-0.5 text-[9px] font-bold bg-accent/15 text-accent px-2 py-0.5 rounded-full uppercase tracking-wider">
            {user?.country_iso || 'CM'}
          </span>
        </div>
      </div>

      {/* Balance card */}
      <div className="mx-3 mt-4 bg-gradient-to-br from-brand to-brand-dark text-white rounded-2xl p-4 shadow-brand">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[10px] text-white/70 uppercase tracking-widest">Available Balance</p>
            <p className="text-[26px] font-black mt-1 tabular-nums">
              {hidden ? '••••••' : balance.toLocaleString()}
              <span className="text-sm ml-1 opacity-70">XAF</span>
            </p>
          </div>
          <button onClick={() => setHidden(v => !v)} className="text-white/80 p-1">
            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={() => navigate('/wallet/topup')}
            className="flex-1 bg-white text-brand font-bold text-[11px] py-2.5 rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <ArrowUpFromLine size={13} /> Top Up
          </button>
          <button
            onClick={() => navigate('/withdraw')}
            className="flex-1 bg-accent text-white font-bold text-[11px] py-2.5 rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <ArrowDownToLine size={13} /> Withdraw
          </button>
        </div>
      </div>

      {/* Escrow auto-release */}
      {escrow && escrow.orders_in_escrow > 0 && (
        <div className="mx-3 mt-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-3 flex items-start gap-3">
          <Clock size={18} className="text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[11px] font-bold text-yellow-800 dark:text-yellow-200">
              {escrow.amount_in_escrow.toLocaleString()} XAF held in escrow
            </p>
            <p className="text-[9px] text-yellow-700 dark:text-yellow-300 mt-0.5">
              {escrow.next_auto_release_at
                ? `Auto-releases ${new Date(escrow.next_auto_release_at).toLocaleString()}`
                : 'Auto-releases 72h after delivery'}
            </p>
          </div>
        </div>
      )}

      {/* Referral snapshot */}
      <div className="mx-3 mt-3 bg-white dark:bg-darkcard rounded-2xl p-3 shadow-sm">
        <div className="flex justify-between items-center mb-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Referrals</p>
          <button onClick={() => navigate('/referrals')} className="text-[10px] font-bold text-accent">
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

      {/* Payment methods */}
      <div className="mx-3 mt-3 bg-white dark:bg-darkcard rounded-2xl p-3 shadow-sm">
        <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
          Payment & Withdrawal Methods
        </p>

        <div className="grid grid-cols-4 gap-2 mb-3">
          {METHODS.map(m => (
            <div key={m} className="flex flex-col items-center gap-1">
              <PaymentMethodLogo method={m} size={40} />
              <p className="text-[9px] text-gray-600 dark:text-gray-300 font-medium text-center">
                {METHOD_LABELS[m].split(' ')[0]}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 dark:border-darkline pt-3">
          <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
            <Phone size={11} /> MoMo Number
          </p>
          {user?.momo_number ? (
            <div className="flex items-center justify-between bg-gray-50 dark:bg-darkbg rounded-lg px-3 py-2">
              <div>
                <p className="text-[11px] font-bold text-navy dark:text-white">{user.momo_number}</p>
                <p className="text-[9px] text-gray-500">
                  {user.momo_provider ? METHOD_LABELS[user.momo_provider as Method] : 'No provider'}
                </p>
              </div>
              <button
                onClick={() => { setMomoNumber(''); setMomoProvider(''); }}
                className="text-[10px] font-bold text-accent"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="tel"
                value={momoNumber}
                onChange={e => setMomoNumber(e.target.value)}
                placeholder="+237 6XX XXX XXX"
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs mb-2"
              />
              <div className="grid grid-cols-4 gap-2 mb-2">
                {METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setMomoProvider(m)}
                    className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 ${
                      momoProvider === m
                        ? 'border-accent bg-accent/5'
                        : 'border-gray-200 dark:border-darkline'
                    }`}
                  >
                    <PaymentMethodLogo method={m} size={28} />
                  </button>
                ))}
              </div>
              <button
                onClick={saveMomo}
                disabled={!momoNumber.trim() || !momoProvider || savingMomo}
                className="w-full bg-accent text-white font-bold py-2 rounded-lg text-[11px] disabled:opacity-40"
              >
                {savingMomo ? 'Saving...' : 'Save MoMo details'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Community */}
      <div className="mx-3 mt-4">
        <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2">Community</p>
        <button
          onClick={() => window.open('https://wa.me/237653931300', '_blank')}
          className="w-full bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3 active:bg-gray-50"
        >
          <div className="w-8 h-8 rounded-lg bg-green-500 text-white flex items-center justify-center">
            <MessageCircle size={14} />
          </div>
          <span className="flex-1 text-left text-[11px] font-bold text-navy dark:text-white">WhatsApp</span>
          <ChevronRight size={14} className="text-gray-400" />
        </button>
        <button
          onClick={() => navigate('/contact-admin')}
          className="w-full bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3 active:bg-gray-50"
        >
          <div className="w-8 h-8 rounded-lg bg-navy text-white flex items-center justify-center">
            <Headphones size={14} />
          </div>
          <span className="flex-1 text-left text-[11px] font-bold text-navy dark:text-white">Contact Admin</span>
          <ChevronRight size={14} className="text-gray-400" />
        </button>
        <button
          onClick={() => window.open('mailto:samuelsenviter589@gmail.com', '_blank')}
          className="w-full bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3 active:bg-gray-50"
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
