import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { d1Request } from '../lib/d1Api';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { MessageSquare, Check, Shield } from 'lucide-react';

export default function StaffPanel() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      let appointment: any = null;
      try {
        const result = await supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/staff_my_profile', {
          method: 'POST', body: JSON.stringify({ args: {} }),
        });
        if (result.data?.ok) appointment = result.data;
      } catch { /* Staff Member task access is checked by D1 below. */ }

      let currentProfile = appointment;
      if (!currentProfile) {
        const profileRes = await d1Request<{ data: any }>('/api/staff/profile');
        currentProfile = profileRes.data;
      }
      if (!currentProfile) { navigate('/home'); return; }
      setProfile(currentProfile);
      if (currentProfile.role === 'staff_member') {
        const taskRes = await d1Request<{ data: any[] }>('/api/staff/tasks');
        setTasks(taskRes.data || []);
        setTickets([]);
      } else {
        const ticketsRes = await supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/staff_list_tickets', {
          method: 'POST', body: JSON.stringify({ args: { p_scope: tab } }),
        });
        if (!ticketsRes.data?.ok) throw new Error(ticketsRes.data?.error || 'Could not load support tickets.');
        setTickets(ticketsRes.data.tickets || []);
        setTasks([]);
      }
    } catch (error: any) {
      console.warn('Could not load staff workspace', error);
      navigate('/home');
      return;
    } finally { setLoading(false); }
  };

  const updateTask = async (taskId: string, status: string) => {
    try {
      await d1Request(`/api/staff/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      await load();
    } catch (error: any) { alert(error.message || 'Could not update task'); }
  };

  useEffect(() => { load(); }, [tab]);

  const claim = async (ticketId: string) => {
    try {
      const result = await supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/staff_claim_ticket', {
        method: 'POST', body: JSON.stringify({ args: { p_ticket_id: ticketId } }),
      });
      if (!result.data?.ok) throw new Error(result.data?.error || 'Could not claim ticket.');
      await load();
    } catch (error: any) { alert(error.message || 'Could not claim ticket'); }
  };

  if (loading) return <div className="p-8 text-center text-[13px] text-[#6f8077]">Loading...</div>;

  if (profile?.role === 'staff_member') {
    return (
      <div className="pb-24 max-w-4xl mx-auto pt-4">
        <div className="bg-white dark:bg-darkcard rounded-[16px] shadow-sm p-4 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6f8077]">Your workspace</p>
          <p className="text-[20px] font-bold text-[#0a3d2b] dark:text-white capitalize">Staff Member</p>
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
              <div className="flex flex-wrap gap-2 mt-3">
                {(['todo','in_progress','blocked','completed'] as const).filter(status => status !== task.status).map(status => (
                  <button key={status} onClick={() => void updateTask(task.id,status)} className="text-[10px] font-bold px-3 py-2 rounded-lg bg-[#e3f7ec] text-[#12935a]">
                    {status === 'todo' ? 'To do' : status === 'in_progress' ? 'In progress' : status === 'blocked' ? 'Blocked' : 'Complete'}
                  </button>
                ))}
              </div>
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
        <p className="text-[20px] font-bold text-[#0a3d2b] dark:text-white capitalize mb-3">
          {profile?.role?.replace('_', ' ')}
        </p>
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
                <p className="text-[12px] text-[#6f8077] font-medium mt-0.5">@{t.username}</p>
                
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
              <button
                onClick={() => navigate(`/staff/tickets/${t.id}`)}
                className="flex-1 bg-[#0a3d2b] text-white text-[13px] font-semibold py-2.5 rounded-[12px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <Shield size={14} /> Open ticket
              </button>
              {!t.assigned_to_me && (
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
