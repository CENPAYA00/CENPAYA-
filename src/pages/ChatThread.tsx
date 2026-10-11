import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Send } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function ChatThread() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me || !id) { setLoading(false); return; }
      setUserId(me.id);

      // Get the other participant
      const { data: others } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('channel_id', id)
        .neq('user_id', me.id)
        .maybeSingle();

      if (others?.user_id) {
        const { data: p } = await supabase
          .from('public_profiles')
          .select('id, username')
          .eq('id', others.user_id)
          .maybeSingle();
        setOtherUser(p);
      }

      // Initial messages
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', id)
        .order('created_at', { ascending: true });
      setMessages(msgs || []);
      setLoading(false);

      // Real-time subscription
      const sub = supabase
        .channel(`chat_${id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${id}`,
        }, (payload) => {
          setMessages(prev => [...prev, payload.new]);
        })
        .subscribe();

      return () => { supabase.removeChannel(sub); };
    };
    const cleanupPromise = load();
    return () => { cleanupPromise.then((fn: any) => fn && fn()); };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !userId) return;
    const body = input.trim();
    setInput('');
    await supabase.from('chat_messages').insert({ channel_id: id, sender_id: userId, body });
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="flex flex-col h-screen bg-offwhite">
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-3 py-3 flex items-center gap-2 sticky top-0 z-10">
        <button onClick={() => navigate('/chat')}><ArrowLeft size={18} /></button>
        <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center text-xs font-bold">
          {otherUser?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <p className="text-[12px] font-bold">@{otherUser?.username || 'Chat'}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-3 pb-20">
        {messages.length === 0 && (
          <p className="text-center text-[10px] text-gray-400 mt-6">
            Say hi to @{otherUser?.username}
          </p>
        )}
        {messages.map(m => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs ${
                mine ? 'bg-navy text-white rounded-br-sm' : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
              }`}>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-100 p-2 flex gap-2"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-full text-xs focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
