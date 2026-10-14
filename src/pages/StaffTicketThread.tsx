import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Send, Check } from 'lucide-react';

export default function StaffTicketThread() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!id) return;
    const { data } = await supabase.rpc('get_ticket_thread', { p_ticket_id: id });
    if (data?.ok) {
      setTicket(data.ticket);
      setMessages(data.messages || []);
      await supabase.rpc('mark_ticket_read', { p_ticket_id: id });
    }
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      await load();
      if (!id) return;
      const sub = supabase
        .channel(`staff_ticket_${id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${id}`,
        }, () => { load(); })
        .subscribe();
      return () => { supabase.removeChannel(sub); };
    };
    init();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !id) return;
    setSending(true);
    const { data, error } = await supabase.rpc('send_ticket_message', {
      p_ticket_id: id,
      p_body: input.trim(),
    });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Send failed');
    else { setInput(''); await load(); }
    setSending(false);
  };

  const setStatus = async (status: 'open' | 'in_progress' | 'resolved' | 'closed') => {
    const { data, error } = await supabase.rpc('set_ticket_status', { p_ticket_id: id, p_status: status });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Update failed');
    else load();
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
      </div>

      <main className="flex-1 overflow-y-auto p-3 pb-24">
        {messages.map(m => {
          const isStaff = m.sender_role === 'staff';
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
    </div>
  );
    }
