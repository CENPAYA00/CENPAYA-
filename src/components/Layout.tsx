import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Store, MessageCircle, User, Plus, Menu, Sparkles, Bell, Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Sidebar from './Sidebar';
import { useTheme } from '../contexts/theme';

export default function Layout() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('users')
        .select('is_subscribed')
        .eq('id', user.id)
        .single();
      setIsSubscribed(!!data?.is_subscribed);

      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadNotifs(count || 0);

      const sub = supabase
        .channel(`notif_${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        }, () => {
          setUnreadNotifs(prev => prev + 1);
        })
        .subscribe();

      cleanup = () => { supabase.removeChannel(sub); };
    };

    init();
    return () => { cleanup?.(); };
  }, []);

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg pb-20">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-3 py-2.5 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <button onClick={() => setSidebarOpen(true)} className="text-white">
          <Menu size={20} />
        </button>
        <h1 className="text-[15px] font-black tracking-tight">CenPaya</h1>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className="text-white">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => navigate('/notifications')} className="text-white relative">
            <Bell size={20} />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {unreadNotifs > 9 ? '9+' : unreadNotifs}
              </span>
            )}
          </button>
          <button onClick={() => navigate('/chat')} className="text-white relative">
            <MessageCircle size={20} />
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {unreadMessages}
              </span>
            )}
          </button>
        </div>
      </header>

      {!isSubscribed && (
        <button
          onClick={() => navigate('/subscribe')}
          className="w-full bg-accent text-white text-[10px] font-bold py-2 flex items-center justify-center gap-1.5 active:bg-accent-dark"
        >
          <Sparkles size={12} />
          Upgrade to Premium — save 2% on every sale
        </button>
      )}

      <main className="px-3 py-3">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 w-full bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline flex justify-around py-1.5 z-50 shadow-[0_-4px_16px_-8px_rgba(15,81,50,0.15)]">
        <NavItem to="/home" icon={<Home size={17} />} label="Home" />
        <NavItem to="/market" icon={<Store size={17} />} label="Market" />
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
