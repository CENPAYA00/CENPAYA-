import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Store, MessageCircle, User, Plus, Bell, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Sidebar from './Sidebar';
import { useTheme } from '../contexts/theme';
import { useSound } from '../contexts/sound';

export default function Layout() {
  const navigate = useNavigate();
  const { play, enabled } = useSound();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Global tap sound
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const interactive = target.closest('button, a, [role="button"], input[type="checkbox"], input[type="radio"]');
      if (!interactive) return;
      if ((interactive as HTMLButtonElement).disabled) return;
      if (interactive.hasAttribute('data-silent') || interactive.closest('[data-silent]')) return;
      play('tap');
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [enabled, play]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      
      setUnreadNotifs(count || 0);

      const sub = supabase.channel(`notif_${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
          setUnreadNotifs(prev => prev + 1);
          play('notification_received');
        })
        .subscribe();

      cleanup = () => { supabase.removeChannel(sub); };
    };
    init();
    return () => { cleanup?.(); };
  }, [play]);

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg pb-28">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Header (Clean & Transparent) */}
      <header className="bg-transparent px-4 pt-4 pb-2 flex justify-between items-center sticky top-0 z-50">
        <h1 className="text-[22px] font-bold text-brand tracking-tight">CenPaya</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/market')} className="text-navy dark:text-gray-300 cursor-pointer">
            <Store size={22} />
          </button>
          <button onClick={() => navigate('/notifications')} className="text-navy dark:text-gray-300 relative cursor-pointer">
            <Bell size={22} />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unreadNotifs}
              </span>
            )}
          </button>
          <button onClick={() => setSidebarOpen(true)} className="text-navy dark:text-gray-300 cursor-pointer">
            <User size={22} />
          </button>
        </div>
      </header>

      {/* Search Bar (Pill Shaped) */}
      <div className="px-4 pb-4">
        <button
          onClick={() => navigate('/search?context=home')}
          className="w-full flex items-center gap-2 px-4 py-3 bg-white dark:bg-darkcard rounded-pill text-[13px] text-mute text-left shadow-soft border border-gray-100 dark:border-darkline"
        >
          <Search size={16} className="text-gray-400" />
          <span className="flex-1">Search people, products, posts...</span>
        </button>
      </div>

      {/* Main Content Area */}
      <main className="px-2">
        <Outlet />
      </main>

      {/* Floating Bottom Navigation */}
      <nav className="fixed bottom-4 left-4 right-4 bg-white dark:bg-darkcard border border-gray-100 dark:border-darkline rounded-pill flex justify-around items-center py-2 px-2 z-50 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        <NavItem to="/home" icon={<Home size={20} />} label="Home" />
        <NavItem to="/market" icon={<Store size={20} />} label="Market" />
        
        {/* Center Plus Button */}
        <button onClick={() => navigate('/create-post')} className="flex items-center justify-center cursor-pointer">
          <div className="w-11 h-11 bg-brand-deeper dark:bg-brand rounded-full flex items-center justify-center shadow-glow -mt-1">
            <Plus size={24} className="text-white" strokeWidth={2.5} />
          </div>
        </button>

        <NavItem to="/chat" icon={<MessageCircle size={20} />} label="Chat" />
        <NavItem to="/profile" icon={<User size={20} />} label="Profile" />
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-colors ${
          isActive ? 'text-brand' : 'text-gray-400 dark:text-gray-500'
        }`
      }
    >
      {icon}
      <span className="text-[9px] mt-1 font-semibold">{label}</span>
    </NavLink>
  );
            }
