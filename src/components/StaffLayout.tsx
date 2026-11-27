import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Home, Inbox, Flag, LogOut, Users, MessageCircle, AlertTriangle, LayoutDashboard } from 'lucide-react';
import { d1Me, d1Logout, d1Request } from '../lib/d1Api';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';

export default function StaffLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState('');
  const [workspacePermissions, setWorkspacePermissions] = useState<string[]>([]);
  const [engineeringRoles, setEngineeringRoles] = useState<string[]>([]);

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

      let role = '';
      let allowed = false;
      try {
        const teamProfile = await d1Request<{ data: { ok?: boolean; role?: string; permissions?: string[] } }>('/api/team/workspace/profile');
        if (teamProfile.data?.ok && teamProfile.data.role) {
          role = teamProfile.data.role;
          allowed = true;
          setWorkspacePermissions(teamProfile.data.permissions || []);
        }
      } catch { /* Older team appointments may still be served by the existing team service. */ }
      if (!allowed) {
        try {
          const appointment = await supabaseWorkerRequest<{ data: { ok?: boolean; role?: string; permissions?: string[] } }>(
            '/api/v1/admin/rpc/staff_my_profile',
            { method: 'POST', body: JSON.stringify({ args: {} }) },
          );
          if (appointment.data?.ok && appointment.data.role) {
            role = appointment.data.role;
            allowed = true;
            setWorkspacePermissions(appointment.data.permissions || []);
          }
        } catch { /* Continue to the independent engineering appointment check. */ }
      }
      try {
        const engineering = await d1Request<{ data: { ok?: boolean; appointments?: { role: string }[] } }>('/api/engineering/profile');
        if (engineering.data?.ok && engineering.data.appointments?.length) {
          setEngineeringRoles(engineering.data.appointments.map(a => a.role));
          if (!allowed) role = 'engineering_member';
          allowed = true;
        }
      } catch { /* No active engineering appointment. Existing app team access remains unchanged. */ }
      if (!allowed && ['owner','super_admin'].includes(user.role)) {
        role = user.role;
        allowed = true;
      }
      if (!allowed) {
        alert('Access denied. No active team or engineering appointment was found.');
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

  const tabs = workspaceRole === 'owner' || workspaceRole === 'super_admin'
    ? [{ path: '/staff/team', icon: <MessageCircle size={15} />, label: 'Team Chat' }]
    : workspaceRole === 'engineering_member'
    ? [{ path: '/engineering', icon: <LayoutDashboard size={15} />, label: 'My Engineering Work' }, { path: '/staff/team', icon: <MessageCircle size={15} />, label: 'Team Chat' }]
    : workspaceRole === 'staff_member'
    ? [{ path: '/staff', icon: <Inbox size={15} />, label: 'My Tasks' }, { path: '/staff/team', icon: <MessageCircle size={15} />, label: 'Team Chat' }]
    : workspaceRole === 'vice_admin'
      ? [
          { path: '/vice-admin', icon: <LayoutDashboard size={15} />, label: 'Overview' },
          { path: '/staff/tasks', icon: <Flag size={15} />, label: 'Team Tasks' },
          { path: '/staff/team', icon: <MessageCircle size={15} />, label: 'Team Chat' },
          ...(['can_manage_staff','can_manage_support_agents'].some(p => workspacePermissions.includes(p)) ? [{ path: '/staff/management', icon: <Users size={15} />, label: 'Team Management' }] : []),
        ]
      : workspaceRole === 'support_agent'
        ? [
            { path: '/staff', icon: <Inbox size={15} />, label: 'Tickets' },
            { path: '/staff/tasks', icon: <Flag size={15} />, label: 'Staff Tasks' },
            { path: '/staff/team', icon: <MessageCircle size={15} />, label: 'Team Chat' },
          ]
        : [
            { path: '/staff', icon: <Inbox size={15} />, label: 'Tickets' },
            { path: '/vice-admin', icon: <LayoutDashboard size={15} />, label: 'Overview' },
            { path: '/staff/tasks', icon: <Flag size={15} />, label: 'Team Tasks' },
            { path: '/staff/team', icon: <MessageCircle size={15} />, label: 'Team Chat' },
          ];

  const visibleTabs = engineeringRoles.length && workspaceRole !== 'engineering_member'
    ? [...tabs, { path: '/engineering', icon: <LayoutDashboard size={15} />, label: 'Engineering' }]
    : tabs;

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
          <p className="text-[9px] text-accent-light font-bold tracking-widest">{workspaceRole === 'engineering_member' ? 'ENGINEERING DEPARTMENT' : workspaceRole === 'owner' || workspaceRole === 'super_admin' ? 'ADMIN TEAM CHAT' : workspaceRole === 'support_agent' ? 'SUPPORT AGENT' : workspaceRole === 'vice_admin' ? 'VICE ADMIN' : workspaceRole === 'owner' || workspaceRole === 'super_admin' ? 'ADMIN SUPPORT' : 'STAFF MEMBER'}</p>
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
        {visibleTabs.map((tab) => (
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
