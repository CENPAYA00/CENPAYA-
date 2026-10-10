import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Store, MessageCircle, User, Plus, Menu, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Sidebar from './Sidebar';

export default function Layout() {
  const navigate = useNavigate();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('is_subscribed')
        .eq('id', user.id)
        .single();
      setIsSubscribed(!!data?.is_subscribed);
    };
    check();
  }, []);

  return (
    <div className="min-h-screen bg-offwhite pb-20">
      {/* Drawer sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Top header */}
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-3 py-2.5 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <button onClick={() => setSidebarOpen(true)} className="text-white">
          <Menu size={20} />
        </button>
        <h1 className="text-[15px] font-black tracking-tight">CenPaya</h1>
        <button onClick={() => navigate('/chat')} className="text-white relative">
          <MessageCircle size={20} />
          {unreadMessages > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
              {unreadMessages}
            </span>
          )}
        </button>
      </header>

      {/* Upgrade banner for non-subscribers */}
      {!isSubscribed && (
        <button
          onClick={() => navigate('/subscribe')}
          className="w-full bg-accent text-white text-[10px] font-bold py-2 flex items-center justify-center gap-1.5 active:bg-accent-dark"
        >
          <Sparkles size={12} />
          Upgrade to Premium — save 2% on every sale
        </button>
      )}

      {/* Screen content */}
      <main className="px-3 py-3">
        <Outlet />
      </main>

      {/* Bottom navigation with center + button */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-100 flex justify-around py-1.5 z-50 shadow-[0_-4px_16px_-8px_rgba(15,81,50,0.15)]">
        <NavItem to="/home" icon={<Home size={17} />} label="Home" />
        <NavItem to="/market" icon={<Store size={17} />} label="Market" />

        {/* Center "+" button */}
        <button onClick={() => navigate('/create-post')} className="flex items-center justify-center">
          <div className="w-9 h-9 bg-accent rounded-full flex items-center justify-center shadow-md -mt-3">
            <Plus size={20} className="text-white" strokeWidth={3} />
          </div>
        </button>

        <NavItem to="/chat" icon={<MessageCircle size={17} />} label="Chat" />
        <NavItem to="/profile" icon={<User size={17} />} label="Profile" />
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center p-1 rounded-md ${isActive ? 'text-accent' : 'text-gray-400'}`
      }
    >
      {icon}
      <span className="text-[9px] mt-0.5 font-medium">{label}</span>
    </NavLink>
  );
      }
