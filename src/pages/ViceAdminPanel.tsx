import { useEffect, useState } from 'react';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Request } from '../lib/d1Api';
import { Shield, Users, ClipboardList, AlertTriangle, MessageSquare, CheckCircle2, Clock } from 'lucide-react';

export default function ViceAdminPanel() {
  const [profile, setProfile] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [escalations, setEscalations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      let workspaceProfile: any = null;
      try {
        const d1Profile = await d1Request<{ data: any }>('/api/team/workspace/profile');
        if (d1Profile.data?.ok) workspaceProfile = d1Profile.data;
      } catch { /* Legacy appointments may still be served by the existing team service. */ }
      if (!workspaceProfile) {
        const legacyProfile = await supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/staff_my_profile', { method: 'POST', body: JSON.stringify({ args: {} }) });
        if (!legacyProfile.data?.ok) throw new Error(legacyProfile.data?.error || 'An active team appointment is required.');
        workspaceProfile = legacyProfile.data;
      }
      if (workspaceProfile.role !== 'vice_admin' && !['owner','super_admin'].includes(workspaceProfile.role)) {
        throw new Error('Vice Admin or higher team authority is required.');
      }
      setProfile(workspaceProfile);
      const role = workspaceProfile.role;
      const permissions: string[] = workspaceProfile.permissions || [];
      const canSeeMetrics = ['owner','super_admin'].includes(role) || permissions.includes('can_view_team_metrics');
      const canManageEscalations = ['owner','super_admin'].includes(role) || permissions.includes('can_manage_escalations');
      const [d1Overview, summary, queue] = await Promise.all([
        canSeeMetrics ? d1Request<{data:any}>('/api/team/workspace/overview').catch(() => ({data:{ok:false}})) : Promise.resolve({data:{ok:false}}),
        canSeeMetrics ? supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/team_admin_overview', { method: 'POST', body: JSON.stringify({ args: {} }) }).catch(() => ({ data: { ok: false } })) : Promise.resolve({ data: { ok: true, overview: null } }),
        canManageEscalations ? d1Request<{data:any}>('/api/team/escalations').catch(() => ({data:{ok:false}})) : Promise.resolve({data:{ok:true,escalations:[]}}),
      ]);
      setOverview(d1Overview.data?.ok ? d1Overview.data.overview : summary.data?.ok ? summary.data.overview || null : null);
      setEscalations(queue.data?.ok ? queue.data.escalations || [] : []);
    } catch (e: any) {
      setError(e?.message || 'Could not load Vice Admin workspace.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const updateEscalation = async (id: string, status: 'in_progress' | 'resolved') => {
    const note = status === 'resolved' ? window.prompt('Resolution note (required):') : null;
    if (status === 'resolved' && !note?.trim()) return;
    try {
      await d1Request(`/api/team/escalations/${id}`, {
        method: 'PATCH', body: JSON.stringify({ status, resolution_note: note }),
      });
      await load();
    } catch (e: any) { alert(e?.message || 'Could not update escalation.'); }
  };

  if (loading) return <div className="p-6 text-center text-xs text-gray-500">Loading Vice Admin workspace...</div>;
  if (error) return <div className="bg-white dark:bg-darkcard rounded-xl p-5 text-sm text-red-600">{error}</div>;

  const metrics = [
    ['Active team', overview?.active_members ?? '—', Users],
    ['Pending appointments', overview?.pending_appointments ?? '—', Clock],
    ['Open tasks', overview?.tasks_pending ?? '—', ClipboardList],
    ['Overdue tasks', overview?.tasks_overdue ?? '—', AlertTriangle],
    ['Open escalations', overview?.open_escalations ?? escalations.length, Shield],
    ['Open support tickets', overview?.tickets_open ?? '—', MessageSquare],
    ['Completed today', overview?.tasks_completed_today ?? '—', CheckCircle2],
    ['Completed this week', overview?.tasks_completed_week ?? '—', CheckCircle2],
    ['Completed this month', overview?.tasks_completed_month ?? '—', CheckCircle2],
  ] as const;

  return (
    <div className="max-w-5xl mx-auto pb-24 space-y-4">
      <section className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Operational command</p>
        <h2 className="text-xl font-black text-navy dark:text-white mt-1">{profile?.title || 'Vice Admin Workspace'}</h2>
        <p className="text-[10px] text-gray-500 mt-1">Vice Admin · {profile?.appointment_status || 'active'}{profile?.department ? ' · '+profile.department : ''}</p>
        {profile?.supervisor_username && <p className="text-[10px] text-gray-500 mt-1">Supervisor: @{profile.supervisor_username}</p>}
        <p className="text-[11px] text-gray-500 mt-2">Supervise daily operations within the permissions granted by the Owner. Critical ownership and financial controls remain restricted.</p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {metrics.map(([label,value,Icon]) => (
          <div key={label} className="bg-white dark:bg-darkcard rounded-xl p-3 shadow-sm">
            <Icon size={17} className="text-accent mb-2" />
            <p className="text-xl font-black text-navy dark:text-white">{value}</p>
            <p className="text-[10px] text-gray-500">{label}</p>
          </div>
        ))}
      </section>

      <section className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-navy dark:text-white">Escalation queue</h3>
            <p className="text-[10px] text-gray-500">Cases raised by Support Agents and team members</p>
          </div>
          <button onClick={() => void load()} className="text-[10px] font-bold text-accent">Refresh</button>
        </div>
        {escalations.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">No escalations are currently assigned or available to you.</p>
        ) : escalations.map(item => (
          <article key={item.id} className="border-t border-gray-100 dark:border-darkline py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-navy dark:text-white">{String(item.target_role || item.escalation_level || 'vice_admin').replace('_',' ').toUpperCase()} escalation</p>
                <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{item.reason}</p>
                <p className="text-[9px] text-gray-400 mt-1">Raised by @{item.raised_by_username || 'team member'} · {item.status} · {new Date(item.created_at).toLocaleString()}</p>{item.ticket_subject && <p className="text-[10px] text-gray-500 mt-1">Ticket: {item.ticket_subject}</p>}
              </div>
              <span className="text-[9px] rounded-full px-2 py-1 bg-amber-50 text-amber-700">{item.status}</span>
            </div>
            {['open','in_progress'].includes(item.status) && (
              <div className="flex gap-2 mt-2">
                {item.status === 'open' && <button onClick={() => void updateEscalation(item.id,'in_progress')} className="text-[10px] font-bold px-3 py-2 rounded-lg bg-blue-50 text-blue-700">Take ownership</button>}
                <button onClick={() => void updateEscalation(item.id,'resolved')} className="text-[10px] font-bold px-3 py-2 rounded-lg bg-green-50 text-green-700 flex items-center gap-1"><CheckCircle2 size={12}/> Resolve</button>
              </div>
            )}
            {item.resolution_note && <p className="text-[10px] text-gray-500 mt-2">Resolution: {item.resolution_note}</p>}
          </article>
        ))}
      </section>

      {Array.isArray(overview?.member_performance) && overview.member_performance.length > 0 && (
        <section className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-navy dark:text-white mb-2">Team performance</h3>
          <div className="space-y-2">
            {overview.member_performance.map((member:any) => (
              <div key={member.user_id} className="border-t border-gray-100 dark:border-darkline pt-2">
                <p className="text-xs font-bold text-navy dark:text-white">@{member.username}</p>
                <p className="text-[10px] text-gray-500">{member.completed}/{member.assigned} completed · {member.overdue} overdue</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {Array.isArray(overview?.recent_tickets) && overview.recent_tickets.length>0 && (
        <section className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-navy dark:text-white mb-2">Recent customer ticket handling</h3>
          {overview.recent_tickets.map((ticket:any)=><div key={ticket.id} className="border-t border-gray-100 dark:border-darkline py-2">
            <p className="text-xs font-bold text-navy dark:text-white">{ticket.subject}</p>
            <p className="text-[10px] text-gray-500">Customer @{ticket.customer||'unknown'} · {ticket.status} · Handled by {ticket.handled_by?('@'+ticket.handled_by):'Unassigned'}</p>
            <p className="text-[9px] text-gray-400">{new Date(ticket.updated_at).toLocaleString()}</p>
          </div>)}
        </section>
      )}
      {Array.isArray(overview?.recent_tasks) && overview.recent_tasks.length>0 && (
        <section className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-navy dark:text-white mb-2">Recent staff assignments</h3>
          {overview.recent_tasks.map((task:any)=><div key={task.id} className="border-t border-gray-100 dark:border-darkline py-2">
            <p className="text-xs font-bold text-navy dark:text-white">{task.title}</p>
            <p className="text-[10px] text-gray-500">@{task.assignee||'unknown'} · {task.status} · Supervisor {task.supervisor?('@'+task.supervisor):'—'}</p>
          </div>)}
        </section>
      )}

      <section className="bg-white dark:bg-darkcard rounded-2xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-navy dark:text-white mb-2">Recent team audit</h3>
        {(overview?.recent_audit || []).length === 0 ? <p className="text-xs text-gray-500">No recent team actions.</p> : (overview.recent_audit || []).map((entry: any) => (
          <div key={entry.id} className="border-t border-gray-100 dark:border-darkline py-2">
            <p className="text-[11px] font-semibold text-navy dark:text-white">{String(entry.action).replace(/_/g,' ')}</p>
            <p className="text-[9px] text-gray-500">{new Date(entry.created_at).toLocaleString()}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
