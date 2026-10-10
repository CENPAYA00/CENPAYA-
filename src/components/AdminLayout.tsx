import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Lock, DollarSign, ToggleLeft, Users,
  LogOut, FileText, Key, Globe
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/');
        return;
      }

      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      // ONLY owner can access admin panel
      if (data?.role !== 'owner') {
        alert('Access denied. This panel is restricted to the platform owner.');
        navigate('/home');
        return;
      }

      setAuthorized(true);
      setChecking(false);
    };
    check();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (checking || !authorized) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-[11px] text-gray-500">Verifying access...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { path: '/admin', icon: <LayoutDashboard size={15} />, label: 'Overview' },
    { path: '/admin/vault', icon: <Lock size={15} />, label: 'Vault' },
    { path: '/admin/finance', icon: <DollarSign size={15} />, label: 'Finance' },
    { path: '/admin/regions', icon: <Globe size={15} />, label: 'Regions' },
    { path: '/admin/features', icon: <ToggleLeft size={15} />, label: 'Features' },
    { path: '/admin/users', icon: <Users size={15} />, label: 'Users' },
    { path: '/admin/permissions', icon: <Key size={15} />, label: 'Permissions' },
    { path: '/admin/audit', icon: <FileText size={15} />, label: 'Audit' },
  ];

  return (
    <div className="min-h-screen bg-offwhite">
      {/* Admin header */}
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

      {/* Horizontal scrollable tabs */}
      <nav className="bg-white border-b border-gray-100 flex overflow-x-auto gap-0.5 px-1.5 sticky top-[57px] z-40 shadow-sm">
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

      {/* Content */}
      <main className="px-3 py-3">
        <Outlet />
      </main>
    </div>
  );
                                          }
