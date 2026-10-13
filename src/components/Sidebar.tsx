import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  X, User, Wallet, Store, ShoppingBag, Sparkles, Users,
  Briefcase, PlusCircle, Zap, Ticket, FileText, Users2,
  Video, Bookmark, Settings, Shield, Lock, DollarSign,
  LogOut, ChevronRight, MessageCircle, HeadphonesIcon,
  Globe, TrendingUp, Link2
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [userRole, setUserRole] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('username, role, is_subscribed')
        .eq('id', user.id)
        .single();
      setUsername(data?.username || 'User');
      setIsSubscribed(!!data?.is_subscribed);
      setUserRole(data?.role || 'user');
    };
    load();
  }, [location.pathname]);

  const go = (path: string) => { onClose(); navigate(path); };
  const logout = async () => { await supabase.auth.signOut(); navigate('/'); };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[100]" onClick={onClose} />
      <aside className="fixed top-0 left-0 h-full w-[88%] max-w-[340px] bg-white dark:bg-darkcard z-[101] shadow-2xl flex flex-col">

        <div className="bg-gradient-to-br from-brand to-brand-dark text-white p-3.5">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-white/15 rounded-full flex items-center justify-center text-base font-bold">
                {username[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <p className="font-bold text-[13px]">@{username}</p>
                <p className="text-[9px] text-accent-light uppercase tracking-wider">
                  {isSubscribed ? '⭐ Premium Member' : 'Free Member'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-white"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {!isSubscribed && (
            <button onClick={() => go('/subscribe')} className="w-full bg-accent text-white p-2.5 flex items-center gap-2.5">
              <Sparkles size={16} />
              <div className="text-left flex-1">
                <p className="font-bold text-[11px]">Upgrade to Premium</p>
                <p className="text-[9px] text-white/80">Save 2% on every sale + more</p>
              </div>
              <ChevronRight size={14} />
            </button>
          )}

          <div className="p-2.5 grid grid-cols-2 gap-2 bg-gray-50 dark:bg-darkbg">
            <button onClick={() => go('/wallet')} className="bg-white dark:bg-darkcard p-2.5 rounded-xl shadow-sm text-left flex flex-col gap-1">
              <Wallet size={16} className="text-accent" />
              <p className="text-[10px] font-bold text-navy dark:text-white">Wallet</p>
              <p className="text-[9px] text-gray-500">Balance & top up</p>
            </button>
            <button onClick={() => go('/referrals')} className="bg-white dark:bg-darkcard p-2.5 rounded-xl shadow-sm text-left flex flex-col gap-1">
              <Link2 size={16} className="text-accent" />
              <p className="text-[10px] font-bold text-navy dark:text-white">Referrals</p>
              <p className="text-[9px] text-gray-500">Invite & earn</p>
            </button>
          </div>

          <div className="p-2.5 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline">
            <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2 flex items-center gap-1">
              <Globe size={9} /> Supported Countries
            </p>
            <div className="flex flex-wrap gap-1">
              {[
                { code: 'CM', name: 'Cameroon', flag: '🇨🇲' },
                { code: 'GA', name: 'Gabon', flag: '🇬🇦' },
                { code: 'CG', name: 'Congo', flag: '🇨🇬' },
                { code: 'TD', name: 'Chad', flag: '🇹🇩' },
                { code: 'CF', name: 'CAR', flag: '🇨🇫' },
                { code: 'GQ', name: 'Eq. Guinea', flag: '🇬🇶' },
              ].map(c => (
                <span key={c.code} className="bg-gray-100 dark:bg-darkbg text-[9px] text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  {c.flag} {c.name}
                </span>
              ))}
            </div>
          </div>

          <Section label="My Account">
            <Item icon={<User size={15} />} label="Profile" onClick={() => go('/profile')} />
            <Item icon={<FileText size={15} />} label="Posts" onClick={() => go('/my-posts')} />
            <Item icon={<Store size={15} />} label="My Listings" onClick={() => go('/my-listings')} />
            <Item icon={<ShoppingBag size={15} />} label="Orders" onClick={() => go('/my-orders')} />
          </Section>

          <Section label="Market">
            <Item icon={<Store size={15} />} label="Market" onClick={() => go('/market')} />
            <Item icon={<Briefcase size={15} />} label="Freelance Services" onClick={() => go('/services')} />
            <Item icon={<PlusCircle size={15} />} label="Create listing" onClick={() => go('/create-listing')} />
            <Item icon={<Zap size={15} />} label="Boost" onClick={() => go('/boosted')} />
            <Item icon={<Ticket size={15} />} label="Coupons" onClick={() => go('/coupons')} />
          </Section>

          <Section label="Social">
            <Item icon={<Users size={15} />} label="Follow" onClick={() => go('/follow')} />
            <Item icon={<Users2 size={15} />} label="Groups" onClick={() => go('/groups')} />
            <Item icon={<Network size={15} />} label="Communities" onClick={() => go('/communities')} />
            <Item icon={<Video size={15} />} label="Reels" onClick={() => go('/reels')} />
            <Item icon={<Bookmark size={15} />} label="Saved" onClick={() => go('/saved')} />
          </Section>

          {(userRole === 'owner' || userRole === 'super_admin') && (
            <Section label="Administration">
              <Item icon={<Shield size={15} />} label="Admin Dashboard" onClick={() => go('/admin')} />
              <Item icon={<Lock size={15} />} label="API Vault" onClick={() => go('/admin/vault')} />
              <Item icon={<DollarSign size={15} />} label="Platform Finance" onClick={() => go('/admin/finance')} />
              <Item icon={<TrendingUp size={15} />} label="Regional Markets" onClick={() => go('/admin/regions')} />
            </Section>
          )}

          <Section label="Support">
            <Item icon={<HeadphonesIcon size={15} />} label="Contact Support" onClick={() => go('/support')} />
            <Item icon={<MessageCircle size={15} />} label="Contact Admin" onClick={() => go('/contact-admin')} />
          </Section>

          <Section label="Settings & Legal">
            <Item icon={<Settings size={15} />} label="Settings" onClick={() => go('/settings')} />
            <Item icon={<FileText size={15} />} label="Terms of Service" onClick={() => go('/legal/terms-of-service')} />
            <Item icon={<FileText size={15} />} label="Privacy Policy" onClick={() => go('/legal/privacy-policy')} />
            <Item icon={<Shield size={15} />} label="Security Policy" onClick={() => go('/legal/security-patch-policy')} />
            <Item icon={<FileText size={15} />} label="Refund Policy" onClick={() => go('/legal/refund-policy')} />
            <Item icon={<FileText size={15} />} label="Subscription Terms" onClick={() => go('/legal/subscription-terms')} />
          </Section>

          <div className="h-3" />
        </div>

        <button
          onClick={logout}
          className="border-t border-gray-100 dark:border-darkline p-3.5 flex items-center gap-3 text-red-500 font-bold text-[11px]"
        >
          <LogOut size={15} /> Log Out
        </button>
      </aside>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 dark:border-darkline">
      {label && (
        <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold px-3.5 pt-2.5 pb-1">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function Item({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3.5 py-2 text-left text-[11px] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-darkbg active:bg-gray-100"
    >
      <span className="flex items-center gap-2.5">
        <span className="text-gray-500">{icon}</span>
        {label}
      </span>
      <ChevronRight size={12} className="text-gray-300" />
    </button>
  );
                }
