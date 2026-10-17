import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Lock, DollarSign, ToggleLeft, Users,
  LogOut, FileText, Key, Globe, MessageSquare, CreditCard, Shield, Flag, UserPlus, Home
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [verifying, setVerifying] = useState(false);

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

      const { data: pwData } = await supabase.rpc('admin_has_password');
      if (cancelled) return;

      if (pwData?.has_password) {
        setNeedsPassword(true);
        setChecking(false);
      } else {
        setAuthorized(true);
        setChecking(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [navigate]);

  const verifyPassword = async () => {
    setPwError('');
    if (!password.trim()) return setPwError('Enter your admin password.');
    setVerifying(true);
    const { data, error } = await supabase.rpc('admin_verify_password', { p_password: password.trim() });
    if (error || !data?.ok) {
      setPwError(error?.message || data?.error || 'Wrong password.');
      setVerifying(false);
      return;
    }
    setAuthorized(true);
    setNeedsPassword(false);
    setVerifying(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#eef2f0] dark:bg-darkbg flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#12935a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[13px] text-[#6f8077]">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (needsPassword && !authorized) {
    return (
      <div className="min-h-screen bg-[#eef2f0] dark:bg-darkbg flex items-center justify-center px-6">
        <div className="w-full max-w-sm bg-white dark:bg-darkcard rounded-[16px] shadow-[0_1px_4px_rgba(10,61,43,0.08)] p-5">
          <div className="flex flex-col items-center mb-4">
            <div className="w-14 h-14 rounded-full bg-[#e3f7ec] flex items-center justify-center mb-2">
              <Lock size={24} className="text-[#12935a]" />
            </div>
            <p className="text-[16px] font-bold text-[#0a3d2b] dark:text-white">Admin access</p>
            <p className="text-[12px] text-[#6f8077] text-center mt-1">Enter your admin password to continue</p>
          </div>

          <input
            type="password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') verifyPassword(); }}
            placeholder="Admin password"
            autoFocus
            className="w-full p-3 border border-[#e6ece8] dark:border-darkline rounded-[12px] bg-[#f8faf9] dark:bg-darkbg text-[14px] mb-2 text-[#12261c]"
          />

          {pwError && <p className="text-[12px] text-[#e5484d] mb-2">{pwError}</p>}

          <button
            onClick={verifyPassword}
            disabled={verifying}
            className="w-full bg-[#12935a] text-white font-bold py-3 rounded-[12px] text-[14px] disabled:opacity-50 mb-2"
          >
            {verifying ? 'Verifying...' : 'Unlock admin'}
          </button>

          <button
            onClick={() => navigate('/home')}
            className="w-full text-[12px] font-bold text-[#6f8077] py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  const tabs = [
    { path: '/admin',                 icon: <LayoutDashboard size={16} />, label: 'Overview' },
    { path: '/admin/inbox',           icon: <MessageSquare size={16} />,   label: 'Inbox' },
    { path: '/admin/reports',         icon: <Flag size={16} />,            label: 'Reports' },
    { path: '/admin/ledger',          icon: <FileText size={16} />,        label: 'Ledger' },
    { path: '/admin/payment-methods', icon: <CreditCard size={16} />,      label: 'Methods' },
    { path: '/admin/escrow',          icon: <Shield size={16} />,          label: 'Escrow' },
    { path: '/admin/vault',           icon: <Lock size={16} />,            label: 'Vault' },
    { path: '/admin/finance',         icon: <DollarSign size={16} />,      label: 'Finance' },
    { path: '/admin/regions',         icon: <Globe size={16} />,           label: 'Regions' },
    { path: '/admin/features',        icon: <ToggleLeft size={16} />,      label: 'Features' },
    { path: '/admin/users',           icon: <Users size={16} />,           label: 'Users' },
    { path: '/admin/staff',           icon: <UserPlus size={16} />,        label: 'Staff' },
    { path: '/admin/permissions',     icon: <Key size={16} />,             label: 'Permissions' },
    { path: '/admin/security',        icon: <Lock size={16} />,            label: 'Security' },
    { path: '/admin/audit',           icon: <FileText size={16} />,        label: 'Audit' },
  ];

  return (
    <div className="min-h-screen bg-[#eef2f0] dark:bg-darkbg">
      {/* Header with Claude's exact gradient */}
      <header className="bg-gradient-to-br from-[#12935a] to-[#0a3d2b] text-white px-4 py-3 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight">CenPaya</h1>
          <p className="text-[11px] text-[#6bf0b2] font-bold tracking-[0.14em]">SUPER ADMIN</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/home')}
            className="bg-white/15 hover:bg-white/25 transition-colors rounded-full px-3 py-1.5 flex items-center gap-1.5 text-[12px] font-semibold"
          >
            <Home size={14} /> Back to app
          </button>
          <button
            onClick={handleLogout}
            className="text-white text-[12px] font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      </header>

      {/* Scrolling Tabs (exactly like mockup) */}
      <nav className="bg-white dark:bg-darkcard border-b border-[#e6ece8] dark:border-darkline flex overflow-x-auto sticky top-[64px] z-40 shadow-sm scrollbar-hide">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/admin'}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-4 py-3.5 text-[13px] font-semibold whitespace-nowrap border-b-[3px] transition-all ${
                isActive ? 'text-[#12935a] border-[#12935a]' : 'text-[#6f8077] border-transparent hover:text-[#0a3d2b]'
              }`
            }
          >
            {tab.icon}
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <main className="px-4 py-4 max-w-4xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
             }
