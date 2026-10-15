import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Home, Inbox, Flag, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function StaffLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { navigate('/'); return; }

      const { data } = await supabase
        .from('users')
        .select('role, banned')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      const role = data?.role;
      const banned = data?.banned;

      const allowed = ['support_agent', 'super_admin', 'owner'].includes(role);
      if (banned !== false || !allowed) {
        alert(`Access denied. Your role is: ${role ?? 'unknown'}`);
        navigate('/home');
        return;
      }
      setAuthorized(true);
      setChecking(false);
    };
    check();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const tabs = [
    { path: '/staff',         icon: <Inbox size={15} />, label: 'Tickets' },
    { path: '/staff/reports', icon: <Flag size={15} />,  label: 'Reports' },
  ];

  if (checking) {
    return (
      <div className="min-h-screen bg-offwhite dark:bg-darkbg flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg">
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-3.5 py-2.5 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div>
          <h1 className="text-[14px] font-black tracking-tight">CenPaya</h1>
          <p className="text-[9px] text-accent-light font-bold tracking-widest">STAFF</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/home')}
            className="text-white bg-white/15 rounded-full px-2.5 py-1 flex items-center gap-1 text-[10px] font-bold"
          >
            <Home size={14} /> Back to app
          </button>
          <button
            onClick={handleLogout}
            className="text-white text-[10px] font-bold flex items-center gap-1"
          >
            <LogOut size={13} /> Logout
          </button>
        </div>
      </header>

      <nav className="bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline flex sticky top-[57px] z-40 shadow-sm">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/staff'}
            className={({ isActive }) =>
              `flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold border-b-2 transition-all ${
                isActive ? 'text-accent border-accent' : 'text-gray-500 border-transparent'
              }`
            }
          >
            {tab.icon}
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <main className="px-3 py-3">
        <Outlet />
      </main>
    </div>
  );
            }
