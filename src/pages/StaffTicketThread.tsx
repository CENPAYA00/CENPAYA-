import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Request } from '../lib/d1Api';
import { ArrowLeft, Send, Check, AlertTriangle } from 'lucide-react';

export default function StaffTicketThread() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState('');
  const [workspaceUserId, setWorkspaceUserId] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!id) return;
    try {
      try {
        const [thread, profile] = await Promise.all([
          d1Request<{ data: any }>(`/api/staff/tickets/${encodeURIComponent(id)}`),
          d1Request<{ data: any }>('/api/staff/profile'),
        ]);
        setTicket(thread.data?.ticket || null);
        setMessages(thread.data?.messages || []);
        setWorkspaceRole(profile.data?.role || '');
        setWorkspaceUserId(profile.data?.id || '');
      } catch {
        // Compatibility path for team appointments that still live in the legacy service.
        const result = await supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/get_ticket_thread', {
          method: 'POST', body: JSON.stringify({ args: { p_ticket_id: id } }),
        });
        if (!result.data?.ok) throw new Error(result.data?.error || 'Could not load ticket.');
        setTicket(result.data.ticket || null);
        setMessages(result.data.messages || []);
        const profile = await supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/staff_my_profile', { method: 'POST', body: JSON.stringify({ args: {} }) });
        if (profile.data?.ok) { setWorkspaceRole(profile.data.role || ''); setWorkspaceUserId(profile.data.user_id || ''); }
      }
    } catch (error) { console.warn('Could not load support ticket', error); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(poll);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !id) return;
    setSending(true);
    try {
      try {
        await d1Request(`/api/staff/tickets/${encodeURIComponent(id)}/messages`, {
          method: 'POST', body: JSON.stringify({ body: input.trim() }),
        });
      } catch {
        const result = await supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/send_ticket_message', {
          method: 'POST', body: JSON.stringify({ args: { p_ticket_id: id, p_body: input.trim() } }),
        });
        if (!result.data?.ok) throw new Error(result.data?.error || 'Could not send reply.');
      }
      setInput('');
      await load();
    } catch (error: any) { alert(error.message || 'Send failed'); }
    setSending(false);
  };

  const setStatus = async (status: 'open' | 'in_progress' | 'resolved' | 'closed') => {
    if (!id) return;
    try {
      try {
        await d1Request(`/api/staff/tickets/${encodeURIComponent(id)}`, {
          method: 'PATCH', body: JSON.stringify({ status }),
        });
      } catch {
        const result = await supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/set_ticket_status', {
          method: 'POST', body: JSON.stringify({ args: { p_ticket_id: id, p_status: status } }),
        });
        if (!result.data?.ok) throw new Error(result.data?.error || 'Could not update ticket status.');
      }
      load();
    } catch (error: any) { alert(error.message || 'Update failed'); }
  };

  const claimTicket = async () => {
    if (!id) return;
    try {
      try {
        await d1Request(`/api/staff/tickets/${encodeURIComponent(id)}/claim`, { method: 'POST' });
      } catch {
        const result = await supabaseWorkerRequest<{ data: any }>('/api/v1/admin/rpc/staff_claim_ticket', {
          method: 'POST', body: JSON.stringify({ args: { p_ticket_id: id } }),
        });
        if (!result.data?.ok) throw new Error(result.data?.error || 'Could not claim ticket.');
      }
      await load();
    } catch (error: any) { alert(error.message || 'Could not claim ticket.'); }
  };

  const escalate = async () => {
    const target = workspaceRole === 'vice_admin'
      ? window.prompt('Escalate to super_admin or owner:', 'super_admin')
      : workspaceRole === 'support_agent'
        ? window.prompt('Escalate to vice_admin, super_admin or owner:', 'vice_admin')
        : 'vice_admin';
    if (!target || !['vice_admin','super_admin','owner'].includes(target)) return;
    const reason = window.prompt('Explain why this ticket needs supervisor attention:');
    if (!reason?.trim()) return;
    try {
      await d1Request('/api/team/escalations', {
        method: 'POST',
        body: JSON.stringify({ target_role: target, reason: reason.trim(), ticket_id: id }),
      });
      alert(`Ticket escalated to ${target.replace('_',' ')}.`);
    } catch (error: any) { alert(error.message || 'Could not escalate ticket.'); }
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!ticket) return <div className="p-4 text-center text-xs">Ticket not found.</div>;

  return (
    <div className="flex flex-col h-screen bg-offwhite dark:bg-darkbg -mx-3 -my-3">
      <header className="bg-navy dark:bg-darkcard text-white px-3 py-3 flex items-center gap-2 sticky top-0 z-10">
        <button onClick={() => navigate('/staff')}><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold truncate">{ticket.subject}</p>
          <p className="text-[9px] opacity-80">
            @{ticket.user_username || ticket.user_id?.slice(0, 8)} · {ticket.status}
          </p>
        </div>
      </header>

      {ticket.assigned_agent_id === workspaceUserId || ['owner','super_admin'].includes(workspaceRole) ? (
      <div className="flex gap-1.5 px-3 py-2 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline overflow-x-auto scrollbar-hide">
        {ticket.status !== 'in_progress' && (
          <button onClick={() => setStatus('in_progress')} className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full bg-blue-50 text-blue-600">
            In progress
          </button>
        )}
        {ticket.status !== 'resolved' && (
          <button onClick={() => setStatus('resolved')} className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full bg-green-50 text-green-600 flex items-center gap-1">
            <Check size={11} /> Resolved
          </button>
        )}
        {ticket.status !== 'closed' && (
          <button onClick={() => setStatus('closed')} className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">
            Close
          </button>
        )}
        {ticket.status !== 'open' && (
          <button onClick={() => setStatus('open')} className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-700">
            Reopen
          </button>
        )}
        <button onClick={() => void escalate()} className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1">
          <AlertTriangle size={11}/> Escalate
        </button>
      </div>
      ) : (
        <div className="px-3 py-2 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline flex items-center gap-2">
          {workspaceRole === 'support_agent' && !ticket.assigned_agent_id ? (
            <button onClick={() => void claimTicket()} className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-accent text-white">Claim this ticket to reply</button>
          ) : (
            <p className="text-[10px] text-gray-500">This ticket is assigned to another agent. You can view it but cannot reply or change its status.</p>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-3 pb-24">
        {messages.map(m => {
          const senderRole = m.sender_role || m.sender_type;
          const isStaff = senderRole === 'staff' || senderRole === 'support' || senderRole === 'admin';
          return (
            <div key={m.id} className={`mb-2 flex ${isStaff ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-[12px] ${
                isStaff
                  ? 'bg-accent text-white rounded-br-sm'
                  : 'bg-white dark:bg-darkcard text-gray-800 dark:text-gray-100 shadow-sm rounded-bl-sm'
              }`}>
                {!isStaff && (
                  <p className="text-[9px] font-bold mb-0.5 text-gray-500">@{m.sender_username}</p>
                )}
                {isStaff && (
                  <p className="text-[9px] font-bold mb-0.5 text-white/80">You (Staff)</p>
                )}
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`text-[8px] mt-1 ${isStaff ? 'text-white/70' : 'text-gray-400'}`}>
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {ticket.assigned_agent_id === workspaceUserId || ['owner','super_admin'].includes(workspaceRole) ? (
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline p-2 flex gap-2 z-10"
      >
        <input
          value={input}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          placeholder="Reply as staff..."
          className="flex-1 p-2.5 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-full text-xs"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </form>
      ) : null}
    </div>
  );
    }
