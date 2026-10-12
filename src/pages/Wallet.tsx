import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  Menu, Bell, Eye, EyeOff, ArrowRightLeft, ArrowDownToLine,
  Gift, Send, Headphones, MessageCircle, ChevronRight
} from 'lucide-react';
import { WalletRow } from '../types/Wallet';
import { useI18n } from '../contexts/i18n';

export default function Wallet() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const fetchWallet = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [walletRes, userRes, notifRes] = await Promise.all([
        supabase.from('wallets').select('*').eq('user_id', user.id).single(),
        supabase.from('users').select('username, country_iso').eq('id', user.id).single(),
        supabase.from('notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('is_read', false),
      ]);

      if (walletRes.data) setWallet(walletRes.data as WalletRow);
      if (userRes.data) setUser(userRes.data);
      setUnread(notifRes.count || 0);
      setLoading(false);
    };
    fetchWallet();
  }, []);

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
      {/* Top bar */}
      <div className="bg-gradient-to-r from-brand to-brand-dark text-white px-3 py-3 flex items-center justify-between">
        <button className="text-white"><Menu size={20} /></button>
        <h1 className="text-[15px] font-black tracking-tight">CenPaya</h1>
        <button onClick={() => navigate('/notifications')} className="relative text-white">
          <Bell size={20} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </div>

      {/* Greeting */}
      <div className="px-4 pt-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-base">
          {user?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-bold text-navy dark:text-white">
            {t('wallet')} · @{user?.username || 'You'}
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
            <p className="text-[10px] text-white/70 uppercase tracking-widest">
              {t('available_balance')}
            </p>
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
            <ArrowRightLeft size={13} /> {t('transfer')}
          </button>
          <button
            onClick={() => navigate('/withdraw')}
            className="flex-1 bg-accent text-white font-bold text-[11px] py-2.5 rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <ArrowDownToLine size={13} /> {t('withdraw')}
          </button>
        </div>
      </div>

      {/* Daily bonus */}
      <div className="mx-3 mt-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-2xl p-3 flex items-center gap-3">
        <Gift size={22} />
        <div className="flex-1">
          <p className="text-[11px] font-bold">{t('daily_bonus')}</p>
          <p className="text-[9px] text-white/80">Check in every day for rewards</p>
        </div>
        <button className="bg-white text-orange-500 text-[10px] font-bold px-3 py-1.5 rounded-lg">
          {t('collect')}
        </button>
      </div>

      {/* Referral snapshot */}
      <div className="mx-3 mt-3 bg-white dark:bg-darkcard rounded-2xl p-3 shadow-sm">
        <div className="flex justify-between items-center mb-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t('wallet_referrals')}</p>
          <button onClick={() => navigate('/referrals')} className="text-[10px] font-bold text-accent">
            {t('see_more')} →
          </button>
        </div>
        <p className="text-[18px] font-black text-navy dark:text-white tabular-nums">
          {referrals.toLocaleString()} <span className="text-[11px] opacity-60">XAF</span>
        </p>
        <p className="text-[9px] text-gray-400 mt-0.5">
          Locked: {wallet.referral_pending_lock.toLocaleString()} · Received: {wallet.referral_received_locked.toLocaleString()}
        </p>
      </div>

      {/* Community */}
      <div className="mx-3 mt-4">
        <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2">
          {t('community')}
        </p>
        <CommunityRow icon={<Send size={14} />} color="bg-sky-500" label="Telegram" onClick={() => window.open('https://t.me/', '_blank')} />
        <CommunityRow icon={<MessageCircle size={14} />} color="bg-green-500" label="WhatsApp" onClick={() => window.open('https://wa.me/', '_blank')} />
        <CommunityRow icon={<Headphones size={14} />} color="bg-navy" label="Customer Service" onClick={() => navigate('/contact-admin')} />
      </div>
    </div>
  );
}

function CommunityRow({ icon, color, label, onClick }: { icon: React.ReactNode; color: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3 active:bg-gray-50"
    >
      <div className={`w-8 h-8 rounded-lg ${color} text-white flex items-center justify-center`}>{icon}</div>
      <span className="flex-1 text-left text-[11px] font-bold text-navy dark:text-white">{label}</span>
      <ChevronRight size={14} className="text-gray-400" />
    </button>
  );
}
