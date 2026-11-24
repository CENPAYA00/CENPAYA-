import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Home, Inbox, Flag, LogOut } from 'lucide-react';
import { d1Me, d1Request, d1Logout } from '../lib/d1Api';

export default function StaffLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState('');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      let user = null;
      try {
        ({ user } = await d1Me());
      } catch {
        if (!cancelled) navigate('/');
        return;
      }
      if (cancelled) return;
      if (!user) { navigate('/'); return; }

      let role = user.role;
      let allowed = ['support_agent', 'super_admin', 'owner'].includes(role);
      if (!allowed) {
        try {
          const workspace = await d1Request<{ data: { role: string } }>('/api/staff/profile');
          role = workspace.data?.role || role;
          allowed = role === 'staff_member' || role === 'staff';
        } catch { allowed = false; }
      }
      if (!allowed) {
        alert(`Access denied. Your role is: ${role || 'unknown'}`);
        navigate('/home');
        return;
      }
      setWorkspaceRole(role);
      setAuthorized(true);
      setChecking(false);
    };
    check();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleLogout = async () => {
    await d1Logout();
    navigate('/');
  };

  const tabs = workspaceRole === 'staff_member'
    ? [{ path: '/staff', icon: <Inbox size={15} />, label: 'Tasks' }]
    : workspaceRole === 'support_agent'
      ? [{ path: '/staff', icon: <Inbox size={15} />, label: 'Tickets' }]
      : [
          { path: '/staff', icon: <Inbox size={15} />, label: 'Tickets' },
          { path: '/staff/reports', icon: <Flag size={15} />, label: 'Reports' },
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
          <p className="text-[9px] text-accent-light font-bold tracking-widest">{workspaceRole === 'support_agent' ? 'SUPPORT AGENT' : workspaceRole === 'owner' || workspaceRole === 'super_admin' ? 'ADMIN SUPPORT' : 'STAFF MEMBER'}</p>
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
