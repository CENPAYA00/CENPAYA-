/* src/pages/Chat.tsx */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { getCachedUser } from '../lib/cache';
import { Search, MessageCircle } from 'lucide-react';
import DemoBadge from '../components/DemoBadge';

export default function Chat() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cleanup;
    let myChannelIds = [];

    const load = async () => {
      const user = await getCachedUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data: myChannels } = await supabase
        .from('chat_participants')
        .select('channel_id')
        .eq('user_id', user.id);

      if (!myChannels || myChannels.length === 0) { setLoading(false); return; }

      const channelIds = myChannels.map(c => c.channel_id);
      myChannelIds = channelIds;

      const [othersRes, demoRes] = await Promise.all([
        supabase.from('chat_participants').select('channel_id, user_id').in('channel_id', channelIds).neq('user_id', user.id),
        supabase.from('chat_channels').select('id, is_demo').in('id', channelIds),
      ]);

      const others = othersRes.data || [];
      const demoMap = {};
      (demoRes.data || []).forEach(c => { demoMap[c.id] = !!c.is_demo; });

      const otherIds = [...new Set(others.map(o => o.user_id))];

      const { data: profiles } = await supabase.from('public_profiles').select('id, username').in('id', otherIds);
      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p.username; });

      // CHANGED: cap the last-message query to keep it fast
      const { data: lastMsgs } = await supabase
        .from('chat_messages')
        .select('channel_id, body, message_type, created_at, sender_id')
        .in('channel_id', channelIds)
        .order('created_at', { ascending: false })
        .limit(500);

      const lastMap = {};
      (lastMsgs || []).forEach(m => {
        if (!lastMap[m.channel_id]) lastMap[m.channel_id] = m;
      });

      const { data: unreadRows } = await supabase
        .from('chat_messages').select('channel_id')
        .in('channel_id', channelIds).neq('sender_id', user.id).is('read_at', null);

      const unreadMap = {};
      (unreadRows || []).forEach(r => { unreadMap[r.channel_id] = (unreadMap[r.channel_id] || 0) + 1; });

      const list = others.map(o => {
        const ch = lastMap[o.channel_id];
        const preview = ch?.message_type === 'voice_note' ? '🎤 Voice note'
          : ch?.message_type === 'shared_post' ? '📎 Shared a post'
          : ch?.body || 'No messages yet';
        return {
          channel_id: o.channel_id,
          other_user_id: o.user_id,
          other_username: profileMap[o.user_id] || 'User',
          last_message: preview,
          last_time: ch?.created_at || null,
          last_sender: ch?.sender_id,
          unread: unreadMap[o.channel_id] || 0,
          is_demo: demoMap[o.channel_id] || false,
        };
      });

      list.sort((a, b) => {
        const ta = a.last_time ? new Date(a.last_time).getTime() : 0;
        const tb = b.last_time ? new Date(b.last_time).getTime() : 0;
        return tb - ta;
      });

      setChannels(list);
      setLoading(false);

      // ADDED: realtime updates for new messages
      const sub = supabase
        .channel('chat_list_' + user.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
          const m = payload.new;
          if (!m || !myChannelIds.includes(m.channel_id)) return;
          setChannels(prev => {
            const idx = prev.findIndex(c => c.channel_id === m.channel_id);
            if (idx < 0) return prev;
            const copy = prev.slice();
            const preview = m.message_type === 'voice_note' ? '🎤 Voice note'
              : m.message_type === 'shared_post' ? '📎 Shared a post'
              : m.body || '';
            copy[idx] = {
              ...copy[idx],
              last_message: preview,
              last_time: m.created_at,
              last_sender: m.sender_id,
              unread: m.sender_id !== user.id ? (copy[idx].unread || 0) + 1 : copy[idx].unread,
            };
            // bubble to top
            const [row] = copy.splice(idx, 1);
            return [row, ...copy];
          });
        })
        .subscribe();

      cleanup = () => { supabase.removeChannel(sub); };
    };
    load();
    return () => { cleanup?.(); };
  }, []);

  const filtered = channels.filter(c =>
    c.other_username.toLowerCase().includes(search.toLowerCase())
  );

  const timeAgo = (d) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading conversations...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <h1 className="text-base font-bold text-navy dark:text-white">Messages</h1>

      <div className="relative mb-3 mt-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search messages..."
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-xs focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {filtered.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-2xl shadow-sm text-center">
          <div className="w-14 h-14 bg-accent/10 rounded-full mx-auto flex items-center justify-center mb-2">
            <MessageCircle size={22} className="text-accent" />
          </div>
          <p className="text-[11px] font-bold text-navy dark:text-white">No conversations yet</p>
          <p className="text-[9px] text-gray-500 mt-1">
            Go to a seller's profile and tap "Message" to start a chat.
          </p>
        </div>
      )}

      {filtered.map(c => (
        <button
          key={c.channel_id}
          onClick={() => navigate(`/chat/${c.channel_id}`)}
          className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-center gap-3 active:bg-gray-50 text-left cursor-pointer"
        >
          <div className="w-11 h-11 bg-accent/15 rounded-full flex items-center justify-center text-accent font-bold text-base shrink-0">
            {c.other_username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <p className="text-[11px] font-bold text-navy dark:text-white truncate">@{c.other_username}</p>
                {c.is_demo && <DemoBadge />}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <p className="text-[9px] text-gray-400">{timeAgo(c.last_time)}</p>
                {c.unread > 0 && (
                  <span className="bg-accent text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {c.unread > 9 ? '9+' : c.unread}
                  </span>
                )}
              </div>
            </div>
            <p className={`text-[10px] truncate mt-0.5 ${
              c.unread > 0 ? 'text-navy dark:text-white font-bold' : 'text-gray-500'
            }`}>
              {c.last_sender === userId ? 'You: ' : ''}{c.last_message}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
      }
