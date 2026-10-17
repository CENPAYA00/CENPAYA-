import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Store, MessageCircle, User, Plus, Bell, Search, Menu, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Sidebar from './Sidebar';
import { useSound } from '../contexts/sound';

export default function Layout() {
  const navigate = useNavigate();
  const { play, enabled } = useSound();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [staffBadge, setStaffBadge] = useState(0);

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

      const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
      const role = data?.role || '';
      if (['support_agent', 'super_admin', 'owner'].includes(role)) {
        setStaffRole(role);
        const [ticketsRes, reportsRes] = await Promise.all([
          supabase.rpc('staff_list_tickets', { p_scope: 'mine' }),
          supabase.rpc('admin_list_reports', { p_status: 'open', p_limit: 100 }),
        ]);
        const ticketCount = (ticketsRes.data?.tickets || []).reduce((s: number, t: any) => s + (t.unread || 0), 0);
        const reportCount = (reportsRes.data?.reports || []).length;
        setStaffBadge(ticketCount + reportCount);
      }

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

  const goToPanel = () => {
    if (staffRole === 'owner' || staffRole === 'super_admin') navigate('/admin');
    else if (staffRole === 'support_agent') navigate('/staff');
  };

  return (
    <div className="h-[100dvh] bg-offwhite dark:bg-darkbg flex flex-col overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Header (Clean & Transparent) */}
      <header className="bg-transparent px-4 pt-4 pb-2 flex justify-between items-center shrink-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-navy dark:text-gray-300 cursor-pointer">
            <Menu size={24} />
          </button>
          <h1 className="text-[22px] font-bold text-brand tracking-tight">CenPaya</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {staffRole && (
            <button
              onClick={goToPanel}
              className="text-navy dark:text-gray-300 relative cursor-pointer"
              title="Switch to dashboard"
            >
              <Shield size={22} />
              {staffBadge > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {staffBadge > 9 ? '9+' : staffBadge}
                </span>
              )}
            </button>
          )}
          
          <button onClick={() => navigate('/notifications')} className="text-navy dark:text-gray-300 relative cursor-pointer">
            <Bell size={22} />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unreadNotifs}
              </span>
            )}
          </button>

          {/* ADDED: Profile icon back */}
          <button onClick={() => navigate('/profile')} className="text-navy dark:text-gray-300 cursor-pointer">
            <User size={22} />
          </button>
        </div>
      </header>

      {/* Search Bar (Pill Shaped) */}
      <div className="px-4 pb-3 shrink-0">
        <button
          onClick={() => navigate('/search?context=home')}
          className="w-full flex items-center gap-2 px-4 py-3 bg-white dark:bg-darkcard rounded-pill text-[13px] text-mute text-left shadow-soft border border-gray-100 dark:border-darkline"
        >
          <Search size={16} className="text-gray-400" />
          <span className="flex-1">Search people, products, posts...</span>
        </button>
      </div>

      {/* Main Content Area - This is the only part that scrolls */}
      <main className="flex-1 overflow-y-auto px-2 pb-24">
        <Outlet />
      </main>

      {/* Floating Bottom Navigation */}
      <nav className="fixed bottom-4 left-4 right-4 bg-white dark:bg-darkcard border border-gray-100 dark:border-darkline rounded-pill flex justify-around items-center py-2 px-2 z-50 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        <NavItem to="/home" icon={<Home size={20} />} label="Home" />
        <NavItem to="/market" icon={<Store size={20} />} label="Market" />
        
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
