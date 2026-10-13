import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Send, Check } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function ContactThread() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [me, setMe] = useState<any>(null);
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
      const u = await getCachedUser();
      setMe(u);
      await load();

      if (!id) return;
      const sub = supabase
        .channel(`ticket_${id}`)
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
    if (error || !data?.ok) {
      alert(error?.message || data?.error || 'Send failed');
    } else {
      setInput('');
      await load();
    }
    setSending(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!ticket) return <div className="p-4 text-center text-xs">Ticket not found.</div>;

  return (
    <div className="flex flex-col h-screen bg-offwhite dark:bg-darkbg">
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-3 py-3 flex items-center gap-2 sticky top-0 z-10">
        <button onClick={() => navigate('/contact-admin')}><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold truncate">{ticket.subject}</p>
          <p className="text-[9px] opacity-80 capitalize">
            {String(ticket.category || '').replace(/_/g, ' ')} · {ticket.status}
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-3 pb-24">
        {messages.map(m => {
          const mine = m.sender_id === me?.id;
          const isStaff = m.sender_role === 'staff';
          return (
            <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-[12px] ${
                mine
                  ? 'bg-navy text-white rounded-br-sm'
                  : isStaff
                  ? 'bg-accent/10 text-navy dark:text-white rounded-bl-sm border border-accent/20'
                  : 'bg-white dark:bg-darkcard text-gray-800 dark:text-gray-100 shadow-sm rounded-bl-sm'
              }`}>
                {!mine && (
                  <p className={`text-[9px] font-bold mb-0.5 ${isStaff ? 'text-accent' : 'text-gray-500'}`}>
                    {isStaff ? 'Admin' : `@${m.sender_username}`}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`text-[8px] mt-1 ${mine ? 'text-white/60' : 'text-gray-400'}`}>
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      <form
        onSubmit={e => { e.preventDefault(); send(); }}
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline p-2 flex gap-2 z-10"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Reply to admin..."
          className="flex-1 p-2.5 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-full text-xs"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center disabled:opacity-50"
        >
          {sending ? <Check size={14} /> : <Send size={14} />}
        </button>
      </form>
    </div>
  );
      }
