import { useEffect, useState } from 'react';
import { supabaseWorkerRequest } from '../../lib/supabaseWorkerApi';
import { UserPlus, X, Mail, Shield, Copy, Check, Ban, Clock } from 'lucide-react';

const PERMISSIONS = [
  { key: 'can_resolve_disputes', label: 'Resolve Disputes' },
  { key: 'can_review_kyc', label: 'Review KYC' },
  { key: 'can_manage_listings', label: 'Manage Listings' },
  { key: 'can_manage_tickets', label: 'Manage Support Tickets' },
  { key: 'can_review_reports', label: 'Review Reports' },
  { key: 'can_escalate', label: 'Escalate Serious Cases' },
  { key: 'can_supervise_staff', label: 'Supervise Staff Members' },
  { key: 'can_submit_reports', label: 'Submit Work Reports' },
  { key: 'can_manage_support_agents', label: 'Manage Support Agents' },
  { key: 'can_manage_staff', label: 'Manage Staff Members' },
  { key: 'can_manage_departments', label: 'Manage Departments' },
  { key: 'can_manage_tasks', label: 'Assign and Manage Tasks' },
  { key: 'can_manage_escalations', label: 'Manage Escalations' },
  { key: 'can_view_team_metrics', label: 'View Team Performance' },
  { key: 'can_manage_team_communications', label: 'Manage Team Communications' },
];

export default function AdminStaff() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [canAppointViceAdmin, setCanAppointViceAdmin] = useState(false);
  const [canConfigureViceAdmin, setCanConfigureViceAdmin] = useState(false);
  const [canManageTasks, setCanManageTasks] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskError, setTaskError] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [invitationResult, usersResult, taskResult, profileResult] = await Promise.all([
        supabaseWorkerRequest<{ data: { ok?: boolean; invitations?: any[]; error?: string } }>('/api/v1/admin/rpc/admin_list_invitations', {
          method: 'POST', body: JSON.stringify({ args: {} }),
        }),
        supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/team_available_colleagues', { method: 'POST', body: JSON.stringify({ args: {} }) }),
        supabaseWorkerRequest<{ data: { ok?: boolean; tasks?: any[] } }>('/api/v1/admin/rpc/team_my_tasks', { method: 'POST', body: JSON.stringify({ args: {} }) }).catch(() => ({ data: { tasks: [] } })),
        supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/staff_my_profile', { method: 'POST', body: JSON.stringify({ args: {} }) }),
      ]);
      if (!invitationResult.data?.ok) throw new Error(invitationResult.data?.error || 'Could not load staff invitations.');
      setInvitations(invitationResult.data.invitations || []);
      const colleagues = usersResult.data?.members || [];
      setTeamMembers(colleagues);
      setStaffMembers(colleagues.filter((user: any) => user.role === 'staff_member' && user.appointment_status === 'active'));
      setCanAppointViceAdmin(['owner','super_admin'].includes(profileResult.data?.role));
      setCanConfigureViceAdmin(profileResult.data?.role === 'owner');
      setCanManageTasks(['owner','super_admin'].includes(profileResult.data?.role) || profileResult.data?.permissions?.includes('can_manage_tasks') || profileResult.data?.permissions?.includes('can_supervise_staff'));
      setTasks(taskResult.data?.tasks || []);
    } catch (error: any) {
      setLoadError(error?.message || 'Could not load staff administration.');
      setInvitations([]);
      setStaffMembers([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const createTask = async () => {
    setTaskError('');
    if (!taskTitle.trim() || !taskAssignee) {
      setTaskError('Choose a staff member and enter a task title.');
      return;
    }
    setTaskSaving(true);
    try {
      await supabaseWorkerRequest('/api/v1/admin/rpc/team_assign_task', {
        method: 'POST',
        body: JSON.stringify({ args: {
          p_title: taskTitle.trim(),
          p_description: taskDescription.trim(),
          p_assigned_to: taskAssignee,
          p_due_at: taskDue ? new Date(taskDue).toISOString() : null,
          p_department_id: null,
        } }),
      });
      setTaskTitle('');
      setTaskDescription('');
      setTaskAssignee('');
      setTaskDue('');
      await load();
    } catch (error: any) {
      setTaskError(error.message || 'Could not create task.');
    } finally {
      setTaskSaving(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copyLink = async (token: string, id: string) => {
    const url = window.location.origin + `/staff/accept/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt('Copy this invitation link:', url);
    }
  };

  const setAppointmentStatus = async (id: string, status: 'active' | 'suspended' | 'removed') => {
    const action = status === 'removed' ? 'remove' : status === 'suspended' ? 'suspend' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${action} this team appointment?`)) return;
    try {
      const result = await supabaseWorkerRequest<{ data: { ok?: boolean; error?: string } }>('/api/v1/admin/rpc/admin_set_team_member_status', {
        method: 'POST', body: JSON.stringify({ args: { p_invitation_id: id, p_status: status } }),
      });
      if (!result.data?.ok) throw new Error(result.data?.error || 'Could not update appointment.');
      await load();
    } catch (error: any) { alert(error.message || 'Could not update appointment.'); }
  };

  const revoke = async (id: string) => {
    if (!window.confirm('Revoke this invitation?')) return;
    try {
      await supabaseWorkerRequest('/api/v1/admin/rpc/admin_revoke_invitation', {
        method: 'POST', body: JSON.stringify({ args: { p_id: id } }),
      });
      await load();
    } catch (error: any) {
      alert(error?.message || 'Could not revoke invitation.');
    }
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-2xl font-bold text-navy dark:text-white">👤 Staff</h2>
          <p className="text-[11px] text-gray-500">Manage Support Agents, Staff Members and Vice Admin appointments, permissions and tasks.</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-accent text-white text-[11px] font-bold px-3 py-2 rounded-lg flex items-center gap-1"
        >
          <UserPlus size={12} /> Invite
        </button>
      </div>

      {loadError && <p role="alert" className="text-[11px] text-red-600 bg-red-50 rounded-lg p-3 mb-3">{loadError}</p>}

      {canManageTasks && <section className="bg-white dark:bg-darkcard rounded-xl shadow-sm p-3 mb-4">
        <h3 className="text-[13px] font-bold text-navy dark:text-white mb-2">Staff tasks</h3>
        <p className="text-[10px] text-gray-500 mb-3">Assign individual work. Staff Members can only see and update tasks assigned to their own account.</p>
        {staffMembers.length === 0 ? (
          <p className="text-[11px] text-gray-500">Invite and activate a Staff Member before assigning tasks.</p>
        ) : (
          <div className="space-y-2">
            <select value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs">
              <option value="">Choose Staff Member</option>
              {staffMembers.map(member => <option key={member.id} value={member.id}>@{member.username || member.email}</option>)}
            </select>
            <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} maxLength={160} placeholder="Task title" className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
            <textarea value={taskDescription} onChange={e => setTaskDescription(e.target.value)} maxLength={5000} placeholder="Instructions and expected result" rows={3} className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
            <input type="datetime-local" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
            {taskError && <p role="alert" className="text-[11px] text-red-600">{taskError}</p>}
            <button onClick={() => void createTask()} disabled={taskSaving || !taskTitle.trim() || !taskAssignee} className="w-full bg-accent text-white font-bold py-2.5 rounded-lg text-xs disabled:opacity-50">{taskSaving ? 'Assigning...' : 'Assign task'}</button>
          </div>
        )}
        {tasks.length > 0 && (
          <div className="mt-3 border-t border-gray-100 dark:border-darkline pt-3 space-y-2">
            {tasks.slice(0,8).map(task => (
              <div key={task.id} className="rounded-lg bg-gray-50 dark:bg-darkbg p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-navy dark:text-white">{task.title}</p>
                  <span className="text-[9px] text-gray-500">{String(task.status).replace('_',' ')}</span>
                </div>
                <p className="text-[9px] text-gray-500 mt-1">Assigned to @{task.assignee_username || 'staff member'}</p>
              </div>
            ))}
          </div>
        )}
      </section>}

      {invitations.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-xl text-center shadow-sm">
          <UserPlus size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[12px] text-gray-500">No invitations yet</p>
        </div>
      )}

      {invitations.map(inv => (
        <div key={inv.id} className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-navy dark:text-white truncate">{inv.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  inv.role === 'support_agent' ? 'bg-accent/15 text-accent' : 'bg-gray-100 dark:bg-darkline text-gray-600 dark:text-gray-300'
                }`}>
                  {inv.role === 'vice_admin' ? 'Vice Admin' : inv.role === 'support_agent' ? 'Support Agent' : 'Staff Member'}
                </span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  inv.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  inv.status === 'accepted' ? 'bg-green-100 text-green-700' :
                  inv.status === 'revoked' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {inv.status}
                </span>
              </div>
            </div>
            {inv.status === 'pending' && (
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => copyLink(inv.token, inv.id)}
                  className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center"
                >
                  {copied === inv.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => revoke(inv.id)}
                  className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center"
                >
                  <Ban size={14} />
                </button>
              </div>
            )}
          </div>

          {Array.isArray(inv.permissions) && inv.permissions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {inv.permissions.map((p: string) => (
                <span key={p} className="text-[8px] bg-gray-100 dark:bg-darkline text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                  {PERMISSIONS.find(x => x.key === p)?.label || p}
                </span>
              ))}
            </div>
          )}

          {inv.status === 'pending' && (
            <p className="text-[9px] text-gray-400 flex items-center gap-1 mt-1.5">
              <Clock size={9} /> Expires {new Date(inv.expires_at).toLocaleDateString()}
            </p>
          )}
          {inv.status === 'accepted' && inv.accepted_at && (
            <p className="text-[9px] text-green-600 mt-1.5">
              Accepted {new Date(inv.accepted_at).toLocaleDateString()}
            </p>
          )}
          {inv.status === 'accepted' && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {inv.appointment_status === 'suspended' ? (
                <button onClick={() => void setAppointmentStatus(inv.id, 'active')} className="text-[9px] font-bold px-2.5 py-1.5 rounded-md bg-green-100 text-green-700">Reactivate</button>
              ) : inv.appointment_status !== 'removed' ? (
                <button onClick={() => void setAppointmentStatus(inv.id, 'suspended')} className="text-[9px] font-bold px-2.5 py-1.5 rounded-md bg-yellow-100 text-yellow-700">Suspend</button>
              ) : null}
              {inv.appointment_status !== 'removed' && (
                <button onClick={() => void setAppointmentStatus(inv.id, 'removed')} className="text-[9px] font-bold px-2.5 py-1.5 rounded-md bg-red-100 text-red-700">Remove appointment</button>
              )}
            </div>
          )}
        </div>
      ))}

      {showInvite && <InviteSheet members={teamMembers} allowViceAdmin={canAppointViceAdmin} canConfigureViceAdmin={canConfigureViceAdmin} onClose={() => setShowInvite(false)} onCreated={() => { setShowInvite(false); load(); }} />}
    </div>
  );
}

function InviteSheet({ onClose, onCreated, members = [], allowViceAdmin = false, canConfigureViceAdmin = false }: any) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'support_agent' | 'staff_member' | 'vice_admin'>('support_agent');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [officialTitle, setOfficialTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const togglePerm = (key: string) => {
    setPermissions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const submit = async () => {
    setErr('');
    if (!email.trim() || !email.includes('@')) return setErr('Enter a valid email.');
    setBusy(true);
    try {
      const result = await supabaseWorkerRequest<{ data: { ok?: boolean; token?: string; error?: string } }>('/api/v1/admin/rpc/admin_invite_staff', {
        method: 'POST',
        body: JSON.stringify({ args: {
          p_email: email.trim().toLowerCase(),
          p_role: role,
          p_permissions: permissions,
          p_title: officialTitle || null,
          p_department: department || null,
          p_supervisor_id: supervisorId || null,
        } }),
      });
      if (!result.data?.ok || !result.data.token) throw new Error(result.data?.error || 'Invite failed.');
      const link = window.location.origin + '/staff/accept/' + result.data.token;
      alert('Invitation created. Share this link:\n' + link);
    } catch (error: any) {
      setErr(error?.message || 'Invite failed.');
      setBusy(false);
      return;
    }
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
          <p className="text-[13px] font-bold text-navy dark:text-white">Invite staff</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
              <Mail size={11} /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
            />
            <p className="text-[9px] text-gray-400 mt-1">Must match the email they used to sign up.</p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Official title</label>
            <input value={officialTitle} onChange={e => setOfficialTitle(e.target.value)} maxLength={100} placeholder="e.g. Regional Support Supervisor" className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Department</label>
            <input value={department} onChange={e => setDepartment(e.target.value)} maxLength={100} placeholder="e.g. Customer Operations" className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Supervisor (optional)</label>
            <select value={supervisorId} onChange={e => setSupervisorId(e.target.value)} className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs">
              <option value="">No direct supervisor</option>
              {members.filter((m:any) => ['vice_admin','super_admin','owner'].includes(m.role) && m.appointment_status !== 'suspended').map((m:any) => <option key={m.id} value={m.id}>@{m.username} · {m.role.replace('_',' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1"><Shield size={11}/> Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(['support_agent', 'staff_member', ...(allowViceAdmin ? ['vice_admin' as const] : [])] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`p-3 rounded-xl border-2 text-[11px] font-bold ${
                    role === r ? 'border-accent bg-accent/5 text-accent' : 'border-gray-200 dark:border-darkline text-navy dark:text-white'
                  }`}
                >
                  {r === 'support_agent' ? 'Support Agent' : r === 'vice_admin' ? 'Vice Admin' : 'Staff Member'}
                </button>
              ))}
            </div>
          </div>

          {(role === 'support_agent' || role === 'staff_member' || (role === 'vice_admin' && canConfigureViceAdmin)) && (
            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 block">
                Permissions (optional)
              </label>
              <div className="space-y-1.5">
                {PERMISSIONS.filter(p => role === 'support_agent' ? ['can_resolve_disputes','can_manage_tickets','can_review_reports','can_escalate','can_supervise_staff'].includes(p.key) : role === 'vice_admin' ? ['can_manage_support_agents','can_manage_staff','can_manage_departments','can_manage_tasks','can_review_reports','can_manage_escalations','can_view_team_metrics','can_manage_team_communications'].includes(p.key) : ['can_manage_listings','can_review_reports','can_review_kyc','can_submit_reports'].includes(p.key)).map(p => (
                  <button
                    key={p.key}
                    onClick={() => togglePerm(p.key)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg border-2 text-left ${
                      permissions.includes(p.key)
                        ? 'border-accent bg-accent/5'
                        : 'border-gray-200 dark:border-darkline'
                    }`}
                  >
                    <span className="text-[11px] text-navy dark:text-white">{p.label}</span>
                    {permissions.includes(p.key) && <Check size={14} className="text-accent" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {err && <p className="text-[11px] text-red-600">{err}</p>}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
          >
            {busy ? 'Creating invitation...' : 'Create invitation'}
          </button>
        </div>
      </div>
    </div>
  );
    }
