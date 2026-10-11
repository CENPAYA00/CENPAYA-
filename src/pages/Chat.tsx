import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { getCachedUser } from '../lib/cache';
import { Search, MessageCircle } from 'lucide-react';

export default function Chat() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      const user = await getCachedUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      // Get my channels
      const { data: myChannels } = await supabase
        .from('chat_participants')
        .select('channel_id')
        .eq('user_id', user.id);

      if (!myChannels || myChannels.length === 0) {
        setLoading(false);
        return;
      }

      const channelIds = myChannels.map((c: any) => c.channel_id);

      // Get other participants
      const { data: others } = await supabase
        .from('chat_participants')
        .select('channel_id, user_id')
        .in('channel_id', channelIds)
        .neq('user_id', user.id);

      const otherIds = [...new Set((others || []).map((o: any) => o.user_id))];

      // Get their profiles
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, username')
        .in('id', otherIds);

      const profileMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p.username; });

      // Get last message per channel
      const { data: lastMsgs } = await supabase
        .from('chat_messages')
        .select('channel_id, body, created_at, sender_id')
        .in('channel_id', channelIds)
        .order('created_at', { ascending: false });

      const lastMap: Record<string, any> = {};
      (lastMsgs || []).forEach((m: any) => {
        if (!lastMap[m.channel_id]) lastMap[m.channel_id] = m;
      });

      // Build channel list
      const list = (others || []).map((o: any) => {
        const ch = lastMap[o.channel_id];
        return {
          channel_id: o.channel_id,
          other_user_id: o.user_id,
          other_username: profileMap[o.user_id] || 'User',
          last_message: ch?.body || 'No messages yet',
          last_time: ch?.created_at || null,
          last_sender: ch?.sender_id,
        };
      });

      // Sort by latest
      list.sort((a: any, b: any) => {
        const ta = a.last_time ? new Date(a.last_time).getTime() : 0;
        const tb = b.last_time ? new Date(b.last_time).getTime() : 0;
        return tb - ta;
      });

      setChannels(list);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = channels.filter(c =>
    c.other_username.toLowerCase().includes(search.toLowerCase())
  );

  const timeAgo = (d: string | null) => {
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
      <h1 className="text-base font-bold text-navy mb-3">Messages</h1>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search messages..."
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {filtered.length === 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm text-center">
          <div className="w-14 h-14 bg-accent/10 rounded-full mx-auto flex items-center justify-center mb-2">
            <MessageCircle size={22} className="text-accent" />
          </div>
          <p className="text-[11px] font-bold text-navy">No conversations yet</p>
          <p className="text-[9px] text-gray-500 mt-1">
            Go to a seller's profile and tap "Message" to start a chat.
          </p>
        </div>
      )}

      {filtered.map(c => (
        <button
          key={c.channel_id}
          onClick={() => navigate(`/chat/${c.channel_id}`)}
          className="w-full bg-white rounded-2xl shadow-sm mb-2 p-3 flex items-center gap-3 active:bg-gray-50 text-left"
        >
          <div className="w-11 h-11 bg-accent/15 rounded-full flex items-center justify-center text-accent font-bold text-base shrink-0">
            {c.other_username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline">
              <p className="text-[11px] font-bold text-navy truncate">@{c.other_username}</p>
              <p className="text-[9px] text-gray-400 shrink-0 ml-2">{timeAgo(c.last_time)}</p>
            </div>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              {c.last_sender === userId ? 'You: ' : ''}{c.last_message}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
          }
