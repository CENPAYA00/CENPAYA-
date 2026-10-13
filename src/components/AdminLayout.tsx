import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Lock, DollarSign, ToggleLeft, Users,
  LogOut, FileText, Key, Globe, MessageSquare, CreditCard, Shield
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      let user = null;
      for (let i = 0; i < 10; i++) {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) { user = data.session.user; break; }
        await new Promise(r => setTimeout(r, 200));
      }
      if (!user) {
        const { data } = await supabase.auth.getUser();
        user = data?.user ?? null;
      }
      if (cancelled) return;
      if (!user) { navigate('/'); return; }

      const { data, error } = await supabase
        .from('users')
        .select('role, banned')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        alert('Could not verify admin access. Check the console.');
        navigate('/home');
        return;
      }

      const role = data?.role;
      const banned = data?.banned;

      if (banned !== false || (role !== 'owner' && role !== 'super_admin')) {
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

  if (checking || !authorized) {
    return (
      <div className="min-h-screen bg-offwhite dark:bg-darkbg flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[11px] text-gray-500">Verifying access...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { path: '/admin',                 icon: <LayoutDashboard size={15} />, label: 'Overview' },
    { path: '/admin/inbox',           icon: <MessageSquare size={15} />,   label: 'Inbox' },
    { path: '/admin/ledger',          icon: <FileText size={15} />,        label: 'Ledger' },
    { path: '/admin/payment-methods', icon: <CreditCard size={15} />,      label: 'Methods' },
    { path: '/admin/escrow',          icon: <Shield size={15} />,          label: 'Escrow' },
    { path: '/admin/vault',           icon: <Lock size={15} />,            label: 'Vault' },
    { path: '/admin/finance',         icon: <DollarSign size={15} />,      label: 'Finance' },
    { path: '/admin/regions',         icon: <Globe size={15} />,           label: 'Regions' },
    { path: '/admin/features',        icon: <ToggleLeft size={15} />,      label: 'Features' },
    { path: '/admin/users',           icon: <Users size={15} />,           label: 'Users' },
    { path: '/admin/permissions',     icon: <Key size={15} />,             label: 'Permissions' },
    { path: '/admin/audit',           icon: <FileText size={15} />,        label: 'Audit' },
  ];

  return (
    <div className="min-h-screen bg-offwhite dark:bg-darkbg">
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-3.5 py-2.5 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div>
          <h1 className="text-[14px] font-black tracking-tight">CenPaya</h1>
          <p className="text-[9px] text-accent-light font-bold tracking-widest">SUPER ADMIN</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-white text-[10px] font-bold flex items-center gap-1"
        >
          <LogOut size={13} /> Logout
        </button>
      </header>

      <nav className="bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline flex overflow-x-auto gap-0.5 px-1.5 sticky top-[57px] z-40 shadow-sm scrollbar-hide">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/admin'}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-bold whitespace-nowrap border-b-2 transition-all ${
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
