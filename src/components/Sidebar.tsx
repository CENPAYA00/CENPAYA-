import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import {
  X, User, Wallet, Store, ShoppingBag, Sparkles, Users,
  Briefcase, PlusCircle, Zap, Ticket, FileText, Users2,
  Video, Bookmark, Settings, Shield, LogOut, ChevronRight,
  MessageCircle, HeadphonesIcon, Globe, Link2, Network, Activity, Crown
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [username, setUsername] = useState('');
  
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, dx: 0, on: false });

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('username, is_subscribed').eq('id', user.id).single();
      setUsername(data?.username || 'User');
      setIsSubscribed(!!data?.is_subscribed);
    };
    load();
    
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
    
    return () => { document.body.style.overflow = 'auto'; };
  }, [location.pathname, open]);

  const go = (path: string) => { onClose(); navigate(path); };
  const logout = async () => {
    await logActivity('logout');
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    drag.current = { x: e.touches[0].clientX, dx: 0, on: true };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!drag.current.on || !panelRef.current) return;
    const dx = Math.min(0, e.touches[0].clientX - drag.current.x);
    drag.current.dx = dx;
    if (dx < -6) {
      panelRef.current.style.transition = 'none';
      panelRef.current.style.transform = `translateX(${dx}px)`;
    }
  };
  const handleTouchEnd = () => {
    if (!panelRef.current) return;
    panelRef.current.style.transition = '';
    panelRef.current.style.transform = '';
    if (drag.current.dx < -80) onClose();
    drag.current.on = false;
  };

  return (
    <>
      <div 
        className={`fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside
        ref={panelRef}
        // FORCED Claude's background colors here (#eef2f0 light, #0d1511 dark)
        className={`fixed top-0 bottom-0 left-0 z-[101] w-[86vw] max-w-[360px] bg-[#eef2f0] dark:bg-[#0d1511] flex flex-col shadow-2xl transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] will-change-transform ${
          open ? 'translate-x-0' : '-translate-x-[102%]'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <header className="relative flex-none px-5 pt-[calc(env(safe-area-inset-top,0px)+20px)] pb-5 bg-gradient-to-br from-[#14a465] to-[#0a3d2b] text-white rounded-br-[26px]">
          <button
            onClick={onClose}
            className="absolute top-[calc(env(safe-area-inset-top,0px)+12px)] right-4 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3.5 pr-10">
            <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/70 text-white flex items-center justify-center text-2xl font-bold shrink-0">
              {username[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-[18px] font-bold text-white truncate">@{username}</p>
              <span className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest ${
                isSubscribed ? 'bg-[#ffd666] text-[#5a3d00]' : 'bg-white/20 text-white'
              }`}>
                {isSubscribed ? <><Crown size={11}/> PREMIUM</> : 'FREE MEMBER'}
              </span>
            </div>
          </div>

          <div className="flex gap-2.5 mt-4">
            <button onClick={() => go('/wallet')} className="flex-1 bg-white/15 rounded-xl p-2.5 text-left border border-white/10 cursor-pointer active:scale-95 transition-transform">
              <span className="flex items-center gap-1 text-[10px] text-white/80 font-bold tracking-wider mb-0.5"><Wallet size={12}/> WALLET</span>
              <span className="text-[13px] font-semibold text-white">Balance</span>
            </button>
            <button onClick={() => go('/referrals')} className="flex-1 bg-white/15 rounded-xl p-2.5 text-left border border-white/10 cursor-pointer active:scale-95 transition-transform">
              <span className="flex items-center gap-1 text-[10px] text-white/80 font-bold tracking-wider mb-0.5"><Link2 size={12}/> REFERRALS</span>
              <span className="text-[13px] font-semibold text-white">Invite & Earn</span>
            </button>
          </div>

          {!isSubscribed && (
            <button onClick={() => go('/subscribe')} className="w-full mt-2.5 bg-white text-[#12935a] rounded-xl p-2.5 text-[13px] font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-95 transition-transform">
              <Sparkles size={16} /> Upgrade to Premium
            </button>
          )}
        </header>

        {/* Scrollable Links */}
        <nav className="flex-1 overflow-y-auto px-4 py-2 scrollbar-hide">
          
          {/* Supported Countries */}
          <div className="mt-2 bg-white dark:bg-[#17211c] rounded-[18px] shadow-[0_1px_4px_rgba(10,61,43,0.08)] p-3.5">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2 flex items-center gap-1">
              <Globe size={12} /> Supported Countries
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { code: 'CM', name: 'Cameroon', flag: '🇨🇲' },
                { code: 'GA', name: 'Gabon', flag: '🇬🇦' },
                { code: 'CG', name: 'Congo', flag: '🇨🇬' },
                { code: 'TD', name: 'Chad', flag: '🇹🇩' },
                { code: 'CF', name: 'CAR', flag: '🇨🇫' },
                { code: 'GQ', name: 'Eq. Guinea', flag: '🇬🇶' },
              ].map(c => (
                <span key={c.code} className="bg-[#eaf6ef] dark:bg-[#26332c] text-[10px] text-[#12935a] dark:text-[#8fa399] px-2 py-1 rounded-md flex items-center gap-1 font-semibold">
                  {c.flag} {c.name}
                </span>
              ))}
            </div>
          </div>

          <Section label="My Account">
            <Item icon={<User size={18} />} label="Profile" onClick={() => go('/profile')} />
            <Item icon={<FileText size={18} />} label="Posts" onClick={() => go('/my-posts')} />
            <Item icon={<Store size={18} />} label="My Listings" onClick={() => go('/my-listings')} />
            <Item icon={<ShoppingBag size={18} />} label="Orders" onClick={() => go('/my-orders')} />
            <Item icon={<Activity size={18} />} label="Activity log" onClick={() => go('/activity')} />
          </Section>

          <Section label="Market">
            <Item icon={<Store size={18} />} label="Market" onClick={() => go('/market')} />
            <Item icon={<Briefcase size={18} />} label="Freelance Services" onClick={() => go('/services')} />
            <Item icon={<PlusCircle size={18} />} label="Create listing" onClick={() => go('/create-listing')} />
            <Item icon={<Zap size={18} />} label="Boost" onClick={() => go('/boosted')} />
            <Item icon={<Ticket size={18} />} label="Coupons" onClick={() => go('/coupons')} />
          </Section>

          <Section label="Social">
            <Item icon={<Users size={18} />} label="Follow" onClick={() => go('/follow')} />
            <Item icon={<Network size={18} />} label="Communities" onClick={() => go('/communities')} />
            <Item icon={<Users2 size={18} />} label="Groups" onClick={() => go('/groups')} />
            <Item icon={<Video size={18} />} label="Reels" onClick={() => go('/reels')} />
            <Item icon={<Bookmark size={18} />} label="Saved" onClick={() => go('/saved')} />
          </Section>

          <Section label="Support">
            <Item icon={<HeadphonesIcon size={18} />} label="Contact Support Agents" onClick={() => go('/contact-support')} />
            <Item icon={<MessageCircle size={18} />} label="Contact Admin" onClick={() => go('/contact-admin')} />
            <Item icon={<Settings size={18} />} label="Support Hub" onClick={() => go('/support')} />
          </Section>

          <Section label="Settings & Legal">
            <Item icon={<Settings size={18} />} label="Settings" onClick={() => go('/settings')} />
            <Item icon={<FileText size={18} />} label="Terms of Service" onClick={() => go('/legal/terms-of-service')} />
            <Item icon={<FileText size={18} />} label="Privacy Policy" onClick={() => go('/legal/privacy-policy')} />
            <Item icon={<Shield size={18} />} label="Security Policy" onClick={() => go('/legal/security-patch-policy')} />
            <Item icon={<FileText size={18} />} label="Refund Policy" onClick={() => go('/legal/refund-policy')} />
            <Item icon={<FileText size={18} />} label="Subscription Terms" onClick={() => go('/legal/subscription-terms')} />
          </Section>

          <div className="h-6" />
        </nav>

        <div className="flex-none p-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] bg-[#eef2f0] dark:bg-[#0d1511] border-t border-gray-200 dark:border-[#26332c]">
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 p-3.5 rounded-[16px] bg-[#fdecec] dark:bg-red-900/20 text-[#d92d33] dark:text-red-400 font-bold text-[15px] cursor-pointer">
            <LogOut size={18} /> Log Out
          </button>
        </div>
      </aside>
    </>
  );
}

/* ---------------- Helpers ---------------- */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-[11px] font-bold tracking-[0.14em] text-[#7b8b83] dark:text-[#8fa399] ml-1.5 mb-2 uppercase">
        {label}
      </p>
      <div className="bg-white dark:bg-[#17211c] rounded-[18px] shadow-[0_1px_4px_rgba(10,61,43,0.08)] overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}

function Item({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button 
      onClick={onClick} 
      className="w-full flex items-center gap-3 px-3.5 min-h-[54px] border-b border-[#edf1ef] dark:border-[#26332c] last:border-0 text-left cursor-pointer transition-colors active:bg-[#f1f7f4] dark:active:bg-white/5"
    >
      {/* FORCED Claude's exact icon background color (#eaf6ef) and text color (#12935a) */}
      <div className="flex items-center justify-center shrink-0 w-[36px] h-[36px] rounded-[11px] bg-[#eaf6ef] dark:bg-[#26332c] text-[#12935a] dark:text-[#8fa399]">
        {icon}
      </div>
      
      <span className="flex-1 text-[15px] font-semibold text-[#12261c] dark:text-[#e8f0ec]">
        {label}
      </span>
      
      <ChevronRight size={16} className="text-[#b4c0ba] dark:text-gray-500" />
    </button>
  );
                  }
