import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Lock, DollarSign, ToggleLeft, Users, LogOut, FileText, Key, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const tabs = [
    { path: '/admin', icon: <LayoutDashboard size={18} />, label: 'Overview' },
    { path: '/admin/vault', icon: <Lock size={18} />, label: 'Vault' },
    { path: '/admin/finance', icon: <DollarSign size={18} />, label: 'Finance' },
    { path: '/admin/regions', icon: <Globe size={18} />, label: 'Regions' },
    { path: '/admin/features', icon: <ToggleLeft size={18} />, label: 'Features' },
    { path: '/admin/users', icon: <Users size={18} />, label: 'Users' },
    { path: '/admin/permissions', icon: <Key size={18} />, label: 'Permissions' },
    { path: '/admin/audit', icon: <FileText size={18} />, label: 'Audit' },
  ];

  return (
    <div className="min-h-screen bg-offwhite">
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-lg shadow-brand/20">
        <div>
          <h1 className="text-xl font-black tracking-tight">CenPaya</h1>
          <p className="text-xs text-accent-light font-bold tracking-widest">SUPER ADMIN</p>
        </div>
        <button onClick={handleLogout} className="text-white text-sm font-bold flex items-center gap-1 active:scale-95 transition-transform">
          <LogOut size={16} /> Logout
        </button>
      </header>

      <nav className="bg-white border-b border-gray-100 flex overflow-x-auto gap-1 px-2 sticky top-[68px] z-40 shadow-sm">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/admin'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
                isActive ? 'text-accent border-accent' : 'text-gray-500 border-transparent'
              }`
            }
          >
            {tab.icon}
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
