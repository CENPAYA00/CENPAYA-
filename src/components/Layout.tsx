import { Outlet, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Home, Store, MessageCircle, User, Plus, Bell, Search, Menu, Shield, Briefcase } from 'lucide-react';
import { useEffect, useState } from 'react';
import { d1Me, d1Request } from '../lib/d1Api';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import Sidebar from './Sidebar';
import { useSound } from '../contexts/sound';
import { MessageToast } from './MessageToast';
import { useMessageAlerts } from '../hooks/useMessageAlerts';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { play, enabled } = useSound();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [staffBadge, setStaffBadge] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const showMainSearch = location.pathname === '/home';
  const activeChatId = location.pathname.startsWith('/chat/') ? location.pathname.split('/')[2] : null;

  // USE MESSAGE ALERTS HOOK
  const { toast, dismiss, unread } = useMessageAlerts(userId, activeChatId, (cid) => navigate(`/chat/${cid}`));

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
    let active = true;
    let timer: number | undefined;
    const init = async () => {
      let user;
      try {
        ({ user } = await d1Me());
      } catch {
        if (active) {
          setAuthenticated(false);
          setAuthLoading(false);
        }
        return;
      }
      if (!active) return;
      if (!user) {
        setAuthenticated(false);
        setAuthLoading(false);
        return;
      }
      setAuthenticated(true);
      setAuthLoading(false);
      setUserId(user.id);
      let role = user.role || '';
      if (role === 'user') {
        try {
          const workspace = await d1Request<{ data: { role: string } }>('/api/staff/profile');
          if (workspace.data?.role === 'staff_member') role = 'staff_member';
        } catch { /* Not every user has a staff workspace. */ }
      }
      if (['support_agent', 'staff_member', 'super_admin', 'owner'].includes(role)) {
        setStaffRole(role);
        if (role !== 'staff_member') {
          const [ticketsRes, reportsRes] = await Promise.all([
            supabaseWorkerRequest<{ data: any[] }>('/api/admin/staff/tickets?scope=mine').catch(() => ({ data: [] })),
            supabaseWorkerRequest<{ data: any[] }>('/api/admin/reports?status=open&limit=100').catch(() => ({ data: [] })),
          ]);
          const ticketCount = (ticketsRes.data || []).reduce((sum: number, ticket: any) => sum + (ticket.unread || 0), 0);
          const reportCount = (reportsRes.data || []).length;
          if (active) setStaffBadge(ticketCount + reportCount);
        }
      }
      const refreshNotifications = async () => {
        try {
          const result = await d1Request<{ data: any[] }>('/api/notifications?limit=100');
          if (!active) return;
          const next = (result.data || []).filter((notification: any) => !notification.is_read).length;
          setUnreadNotifs(previous => {
            if (next > previous) play('notification_received');
            return next;
          });
        } catch { /* Retry on the next polling cycle. */ }
      };
      await refreshNotifications();
      timer = window.setInterval(() => { void refreshNotifications(); }, 60000);
    };
    void init();
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, [play]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Checking your session...</div>;
  }
  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const goToPanel = () => {
    if (staffRole === 'owner' || staffRole === 'super_admin') navigate('/admin');
    else if (staffRole === 'support_agent' || staffRole === 'staff_member') navigate('/staff');
  };

  return (
    <div className="h-[100dvh] bg-offwhite dark:bg-darkbg flex flex-col overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      {/* IN-APP TOAST NOTIFICATION */}
      <MessageToast toast={toast} onOpen={(cid) => navigate(`/chat/${cid}`)} onDismiss={dismiss} />

      <header className="bg-[#081426] text-white px-4 pt-3 pb-3 flex justify-between items-center shrink-0 z-50 shadow-[0_8px_28px_rgba(8,20,38,0.18)]">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="text-white/90 hover:text-white p-1 rounded-xl">
            <Menu size={23} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-[#35d5c4] via-[#477cff] to-[#9c55ef] text-white text-[23px] font-black shadow-[0_4px_14px_rgba(71,124,255,0.35)]">C</span>
            <div className="min-w-0 leading-tight">
              <h1 className="text-[20px] font-extrabold tracking-tight text-white">CenPaya</h1>
              <p className="text-[9px] tracking-[0.12em] uppercase text-blue-100/75">Buy · Sell · Connect · Grow</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {staffRole && (
            <button onClick={goToPanel} aria-label="Admin or staff panel" className="text-white/90 relative p-2 rounded-xl hover:bg-white/10">
              <Shield size={20} />
              {staffBadge > 0 && <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{staffBadge > 9 ? '9+' : staffBadge}</span>}
            </button>
          )}
          <button onClick={() => navigate('/services')} aria-label="Services" className="text-white/90 p-2 rounded-xl hover:bg-white/10"><Briefcase size={20} /></button>
          <button onClick={() => navigate('/notifications')} aria-label="Notifications" className="text-white/90 relative p-2 rounded-xl hover:bg-white/10">
            <Bell size={20} />
            {unreadNotifs > 0 && <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{unreadNotifs > 99 ? '99+' : unreadNotifs}</span>}
          </button>
          <button onClick={() => navigate('/profile')} aria-label="Profile" className="text-white/90 p-2 rounded-xl hover:bg-white/10"><User size={20} /></button>
        </div>
      </header>

      {showMainSearch && (
        <div className="px-4 pb-3 shrink-0">
          <button
            onClick={() => navigate('/search?context=home')}
            className="w-full flex items-center gap-2 px-4 py-3 bg-white dark:bg-darkcard rounded-pill text-[13px] text-gray-600 dark:text-gray-300 text-left shadow-soft border border-gray-100 dark:border-darkline"
          >
            <Search size={16} className="text-gray-500 dark:text-gray-400" />
            <span className="flex-1">Search people, products, posts...</span>
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-2 pb-24">
        <Outlet />
      </main>

      <nav aria-label="Main navigation" className="fixed bottom-3 left-3 right-3 bg-white/95 dark:bg-[#111d32]/95 backdrop-blur-xl border border-[#e3eaf5] dark:border-[#263955] rounded-[24px] flex justify-around items-center py-2 px-1 z-50 shadow-[0_12px_34px_rgba(8,20,38,0.16)]">
        <NavItem to="/home" icon={<Home size={20} />} label="Home" />
        <NavItem to="/market" icon={<Store size={20} />} label="Market" />
        <button onClick={() => navigate('/create-post')} aria-label="Create a post" className="flex items-center justify-center rounded-full p-1 bg-transparent">
          <span className="w-12 h-12 bg-gradient-to-br from-[#4d83ff] to-[#2459d6] rounded-2xl flex items-center justify-center shadow-[0_6px_16px_rgba(40,100,240,0.35)] -mt-4 ring-4 ring-white dark:ring-[#111d32]">
            <Plus size={25} className="text-white" strokeWidth={2.5} />
          </span>
        </button>
        <NavItem to="/chat" icon={<MessageCircle size={20} />} label="Chat" badge={unread} />
        <NavItem to="/profile" icon={<User size={20} />} label="Profile" />
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label, badge = 0 }: { to: string; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-colors relative ${
          isActive ? 'text-[#2864f0] dark:text-[#79a2ff]' : 'text-[#6c7890] dark:text-[#9aa9c1]'
        }`
      }
    >
      <div className="relative">
        {icon}
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 bg-danger text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span className="text-[9px] mt-1 font-semibold">{label}</span>
    </NavLink>
  );
    }
