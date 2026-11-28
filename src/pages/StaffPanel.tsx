import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { d1Request } from '../lib/d1Api';
import { MessageSquare, Check, Shield } from 'lucide-react';

export default function StaffPanel() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [loading, setLoading] = useState(true);
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  const [taskEvidence, setTaskEvidence] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const result = await d1Request<{ data: any }>('/api/team/workspace/profile');
      const teamProfile = result.data;
      if (!teamProfile?.ok) throw new Error('No active staff or support appointment was found.');

      if (teamProfile.role === 'vice_admin') { navigate('/vice-admin', { replace: true }); return; }
      if (teamProfile.role === 'staff_member') {
        setProfile({ ...teamProfile, source: 'd1' });
        const taskRes = await d1Request<{ data: any[] }>('/api/staff/tasks');
        setTasks(taskRes.data || []);
        setTickets([]);
        return;
      }

      if (['support_agent','owner','super_admin'].includes(teamProfile.role)) {
        const staffProfile = await d1Request<{ data: any }>('/api/staff/profile');
        setProfile({ ...teamProfile, ...staffProfile.data, source: 'd1' });
        const ticketRes = await d1Request<{ data: any[] }>(`/api/staff/tickets?scope=${tab}&queue_type=support`);
        setTickets(ticketRes.data || []);
        setTasks([]);
        return;
      }
      throw new Error('This account does not have a staff workspace role.');
    } catch (error: any) {
      console.warn('Could not load staff workspace', error);
      navigate('/home');
    } finally { setLoading(false); }
  };

  const updateTask = async (taskId: string, status: string) => {
    try {
      await d1Request(`/api/staff/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          body: taskNotes[taskId] || '',
          attachment_url: taskEvidence[taskId]?.trim() || '',
        }),
      });
      setTaskNotes(previous => ({ ...previous, [taskId]: '' }));
      setTaskEvidence(previous => ({ ...previous, [taskId]: '' }));
      await load();
    } catch (error: any) { alert(error.message || 'Could not update task'); }
  };

  useEffect(() => { load(); }, [tab]);

  const claim = async (ticketId: string) => {
    try {
      await d1Request(`/api/staff/tickets/${encodeURIComponent(ticketId)}/claim`, { method: 'POST' });
      await load();
    } catch (error: any) { alert(error.message || 'Could not claim ticket'); }
  };

  if (loading) return <div className="p-8 text-center text-[13px] text-[#6f8077]">Loading...</div>;

  if (profile?.role === 'staff_member') {
    return (
      <div className="pb-24 max-w-4xl mx-auto pt-4">
        <div className="bg-white dark:bg-darkcard rounded-[16px] shadow-sm p-4 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6f8077]">Your workspace</p>
          <p className="text-[20px] font-bold text-[#0a3d2b] dark:text-white capitalize">{profile?.title || 'Staff Member'}</p>
          <p className="text-[11px] text-gray-500 mt-1">Staff Member · {profile?.appointment_status || 'active'}{profile?.department ? ' · '+profile.department : ''}</p>
          {profile?.supervisor_username && <p className="text-[10px] text-gray-500 mt-1">Supervisor: @{profile.supervisor_username}</p>}
          <p className="text-[11px] text-gray-500 mt-1">Only tasks assigned to your account appear here.</p>
        </div>
        {tasks.length === 0 && (
          <div className="bg-white dark:bg-darkcard p-8 rounded-[16px] text-center shadow-sm">
            <Check size={30} className="mx-auto text-[#b4c0ba] mb-2" />
            <p className="text-[14px] font-bold text-[#0a3d2b] dark:text-white">No tasks assigned</p>
            <p className="text-[11px] text-gray-500 mt-1">Your manager will add work here when it is ready.</p>
          </div>
        )}
        <div className="space-y-3">
          {tasks.map(task => (
            <section key={task.id} className="bg-white dark:bg-darkcard rounded-[16px] shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] font-bold text-[#0a3d2b] dark:text-white">{task.title}</p>
                <span className="text-[9px] font-bold rounded-full px-2 py-1 bg-gray-100 dark:bg-darkline text-gray-600 dark:text-gray-300">{String(task.status).replace('_',' ')}</span>
              </div>
              {task.description && <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-wrap">{task.description}</p>}
              {task.due_at && <p className="text-[10px] text-gray-500 mt-2">Due {new Date(task.due_at).toLocaleString()}</p>}
              <><textarea
                value={taskNotes[task.id] || ''}
                onChange={e => setTaskNotes(previous => ({ ...previous, [task.id]: e.target.value }))}
                maxLength={5000}
                placeholder="Progress update, completion report or evidence notes..."
                rows={2}
                className="w-full mt-3 p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs"
              />
              <input
                value={taskEvidence[task.id] || ''}
                onChange={e => setTaskEvidence(previous => ({ ...previous, [task.id]: e.target.value }))}
                maxLength={2048}
                placeholder="Evidence or document link (optional)"
                className="w-full mt-2 p-2.5 rounded-lg border border-gray-200 dark:border-darkline bg-gray-50 dark:bg-darkbg text-xs"
              /></>
              <div className="flex flex-wrap gap-2 mt-2">
                {(['todo','in_progress','blocked','completed'] as const).filter(status => status !== task.status).map(status => (
                  <button key={status} onClick={() => void updateTask(task.id,status)} className="text-[10px] font-bold px-3 py-2 rounded-lg bg-[#e3f7ec] text-[#12935a]">
                    {status === 'todo' ? 'To do' : status === 'in_progress' ? 'In progress' : status === 'blocked' ? 'Blocked' : status === 'completed' ? 'Mark complete' : 'Submit report'}
                  </button>
                ))}
              </div>
              {Array.isArray(task.updates) && task.updates.length > 0 && (
                <div className="mt-3 border-t border-gray-100 dark:border-darkline pt-2 space-y-1">
                  {task.updates.slice(-3).map((update: any) => <div key={update.id} className="text-[10px] text-gray-500"><p>{update.body || (update.update_type === 'completion' ? 'Marked complete' : update.update_type)} · {new Date(update.created_at).toLocaleString()}</p>{update.attachment_url && <a href={update.attachment_url} target="_blank" rel="noreferrer" className="text-[#12935a] underline break-all">Open evidence</a>}</div>)}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-4xl mx-auto pt-4">
      
      {/* Profile Card */}
      <div className="bg-white dark:bg-darkcard rounded-[16px] shadow-[0_1px_4px_rgba(10,61,43,0.08)] p-4 mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6f8077] mb-1">Your role</p>
        <p className="text-[20px] font-bold text-[#0a3d2b] dark:text-white capitalize mb-1">
          {profile?.title || profile?.role?.replace('_', ' ')}
        </p>
        <p className="text-[10px] text-gray-500 mb-3">
          {profile?.role?.replace('_',' ')} · {profile?.appointment_status || 'active'}{profile?.department ? ' · '+profile.department : ''}
        </p>
        {profile?.supervisor_username && <p className="text-[10px] text-gray-500 mb-3">Supervisor: @{profile.supervisor_username}</p>}
        {Array.isArray(profile?.permissions) && profile.permissions.length > 0 && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6f8077] mb-2">Permissions</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.permissions.map((p: string) => (
                <span key={p} className="text-[11px] font-semibold bg-[#e3f7ec] text-[#12935a] px-2.5 py-1 rounded-md">
                  {p.replace(/^can_/, '').replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Segmented Tab Control */}
      <div className="grid grid-cols-2 bg-[#e9eeeb] dark:bg-darkline rounded-[14px] p-1 mb-4 shadow-inner">
        {(['all', 'mine'] as const).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`py-2 text-[13px] font-semibold rounded-[10px] transition-all ${
              tab === k ? 'bg-white dark:bg-darkcard text-[#0a3d2b] dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-[#6f8077]'
            }`}
          >
            {k === 'all' ? 'All open' : 'Assigned to me'}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {tickets.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-8 rounded-[16px] shadow-[0_1px_4px_rgba(10,61,43,0.08)] text-center">
          <MessageSquare size={32} className="mx-auto text-[#b4c0ba] mb-3" />
          <p className="text-[15px] font-bold text-[#0a3d2b] dark:text-white">
            {tab === 'mine' ? 'No tickets assigned to you' : 'No open tickets'}
          </p>
        </div>
      )}

      {/* Ticket Cards */}
      <div className="space-y-3">
        {tickets.map(t => (
          <div key={t.id} className="bg-white dark:bg-darkcard rounded-[16px] shadow-[0_1px_4px_rgba(10,61,43,0.08)] p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#e3f7ec] flex items-center justify-center text-[#12935a] shrink-0">
                <MessageSquare size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-[#0a3d2b] dark:text-white truncate">{t.subject}</p>
                <p className="text-[12px] text-[#6f8077] font-medium mt-0.5">@{t.username || 'member'}</p>
                
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[10px] font-bold bg-[#fff9e0] text-[#8a5a00] px-2 py-0.5 rounded-md border border-[#f3e08a]">
                    {t.priority}
                  </span>
                  <span className="text-[11px] font-medium text-[#6f8077]">{t.category}</span>
                  {t.unread > 0 && (
                    <span className="text-[10px] font-bold bg-[#12935a] text-white px-2 py-0.5 rounded-full">
                      {t.unread} new
                    </span>
                  )}
                  {t.assigned_to_me && (
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200">
                      Assigned to you
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              {(t.assigned_to_me || ['owner','super_admin'].includes(profile?.role)) && (
                <button
                  onClick={() => navigate(`/staff/tickets/${t.id}`)}
                  className="flex-1 bg-[#0a3d2b] text-white text-[13px] font-semibold py-2.5 rounded-[12px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                >
                  <Shield size={14} /> Open ticket
                </button>
              )}
              {!t.assigned_to_me && profile?.role === 'support_agent' && (
                <button
                  onClick={() => claim(t.id)}
                  className="flex-1 bg-[#e3f7ec] text-[#12935a] text-[13px] font-semibold py-2.5 rounded-[12px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                >
                  <Check size={14} /> Claim
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
