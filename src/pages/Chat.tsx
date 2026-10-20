import { useEffect, useState, useMemo, useDeferredValue } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { getCachedUser } from '../lib/cache';
import { Search, MessageCircle, Bell } from 'lucide-react';
import DemoBadge from '../components/DemoBadge';
import { useQuery } from '@tanstack/react-query';
import { enablePush } from '../lib/push';

type ChatRow = {
  channel_id: string;
  other_user_id: string;
  other_username: string;
  other_avatar: string | null;
  last_message: string;
  last_time: string | null;
  last_sender: string | null;
  unread: number;
  is_demo: boolean;
};

// Hook for Online Status
function useOnline(me: string | null) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!me) return;
    const ch = supabase.channel('online-users', { config: { presence: { key: me } } });
    ch.on('presence', { event: 'sync' }, () => {
      setIds(new Set(Object.keys(ch.presenceState())));
    }).subscribe(async (s) => {
      if (s === 'SUBSCRIBED') await ch.track({ at: Date.now() });
    });
    return () => { supabase.removeChannel(ch); };
  }, [me]);
  return ids;
}

export default function Chat() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pushState, setPushState] = useState<string>('default'); // Added for push banner
  const deferredSearch = useDeferredValue(search); 

  useEffect(() => {
    getCachedUser().then(u => { if (u) setUserId(u.id); });
  }, []);

  const onlineIds = useOnline(userId);

  const { data: channels = [], isLoading } = useQuery<ChatRow[]>({
    queryKey: ['chat_list', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data: myChannels } = await supabase.from('chat_participants').select('channel_id').eq('user_id', userId);
      if (!myChannels || myChannels.length === 0) return [];
      const channelIds = myChannels.map(c => c.channel_id);

      const [othersRes, demoRes, lastMsgsRes] = await Promise.all([
        supabase.from('chat_participants').select('channel_id, user_id, users(username, avatar_url)').in('channel_id', channelIds).neq('user_id', userId),
        supabase.from('chat_channels').select('id, is_demo').in('id', channelIds),
        supabase.from('chat_messages_stream').select('channel_id, body_text, sender_id').in('channel_id', channelIds).order('delivered_at', { ascending: false }).limit(500)
      ]);
      // Derive unread counts from last messages: count messages where sender_id != userId
      // Since chat_messages_stream has no read_at, we count all messages from other senders as unread candidates
      const unreadCounts: Record<string, number> = {};
      (lastMsgsRes.data || []).forEach((m: any) => {
        if (m.sender_id && m.sender_id !== userId) {
          unreadCounts[m.channel_id] = (unreadCounts[m.channel_id] || 0) + 1;
        }
      });

      const others = (othersRes.data || []) as any[];
      const demoMap: Record<string, boolean> = {};
      (demoRes.data || []).forEach((c: any) => { demoMap[c.id] = !!c.is_demo; });

      const lastMap: Record<string, any> = {};
      (lastMsgsRes.data || []).forEach((m: any) => { if (!lastMap[m.channel_id]) lastMap[m.channel_id] = m; });

      const unreadMap: Record<string, number> = {};
      Object.keys(unreadCounts).forEach((k) => { unreadMap[k] = unreadCounts[k]; });

      const list: ChatRow[] = others.map((o) => {
        const ch = lastMap[o.channel_id];
        const preview = ch?.body_text ? '📝 ' + ch.body_text.slice(0, 50) + (ch.body_text.length > 50 ? '...' : '') : 'No messages yet';
        return {
          channel_id: o.channel_id,
          other_user_id: o.user_id,
          other_username: o.users?.username || 'User',
          other_avatar: o.users?.avatar_url || null,
          last_message: preview,
          last_time: ch?.delivered_at || null,
          last_sender: ch?.sender_id || null,
          unread: unreadMap[o.channel_id] || 0,
          is_demo: demoMap[o.channel_id] || false,
        };
      });
      return list.sort((a, b) => new Date(b.last_time || 0).getTime() - new Date(a.last_time || 0).getTime());
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        supabase.from('user_follows').select('p:followed_id(id, username, avatar_url)').eq('follower_id', userId).limit(20),
        supabase.from('user_follows').select('p:follower_id(id, username, avatar_url)').eq('followed_id', userId).limit(20),
      ]);
      const rows = [...(a.data || []), ...(b.data || [])] as any[];
      return rows.map(r => r.p).filter(Boolean);
    }
  });

  const filtered = channels.filter((c) => c.other_username.toLowerCase().includes(deferredSearch.toLowerCase()));

  const timeAgo = (d: string | null) => {
    if (!d) return '';
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  if (isLoading) return <div className="p-4 text-center text-xs text-mute">Loading...</div>;

  return (
    <div className="px-4 py-3 pb-24">
      <h1 className="text-[22px] font-bold text-navy dark:text-white mb-4">Messages</h1>
      
      {/* NOTIFICATION BANNER */}
      {pushState === 'default' && (
        <div className="bg-[#eaf6ef] dark:bg-[#12935a]/10 border border-[#12935a]/20 rounded-xl p-3 flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-[#0a3d2b] dark:text-white">
            <Bell size={18} className="text-[#12935a]" />
            <span className="text-[13px] font-bold">Get notified of new messages</span>
          </div>
          <button 
            onClick={async () => { if (userId) setPushState(await enablePush(userId)); }}
            className="bg-[#12935a] text-white text-[12px] font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
          >
            Turn on
          </button>
        </div>
      )}

      <div className="relative mb-4">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search messages..."
          className="w-full pl-11 pr-4 py-3.5 border border-gray-200 dark:border-darkline rounded-pill bg-white dark:bg-darkcard text-[14px] text-ink outline-none"
        />
      </div>

      {contacts.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4 mb-2 scrollbar-hide">
          {contacts.map((c: any) => (
            <button key={c.id} onClick={() => navigate(`/seller/${c.id}`)} className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="relative w-14 h-14 rounded-full bg-brand/10 border-2 border-brand flex items-center justify-center text-brand font-bold text-lg overflow-hidden">
                {c.avatar_url ? <img src={c.avatar_url} className="w-full h-full object-cover" /> : c.username[0].toUpperCase()}
                {onlineIds.has(c.id) && <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />}
              </div>
              <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 truncate w-14 text-center">{c.username.split('_')[0]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-darkcard rounded-card shadow-soft overflow-hidden">
        {filtered.length === 0 && (
          <div className="p-8 text-center text-mute">
            <MessageCircle size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-[14px] font-bold text-navy dark:text-white">No messages yet</p>
            <p className="text-[12px]">Tap a profile above to start a conversation.</p>
          </div>
        )}
        {filtered.map((c, i) => (
          <button
            key={c.channel_id}
            onClick={() => navigate(`/chat/${c.channel_id}`)}
            className={`w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${
              i !== filtered.length - 1 ? 'border-b border-gray-100 dark:border-darkline' : ''
            }`}
          >
            <div className="relative w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-xl shrink-0 overflow-hidden">
              {c.other_avatar ? <img src={c.other_avatar} className="w-full h-full object-cover" /> : c.other_username[0].toUpperCase()}
              {onlineIds.has(c.other_user_id) && <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline gap-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-[15px] font-bold text-navy dark:text-white truncate">@{c.other_username}</p>
                  {c.is_demo && <DemoBadge />}
                </div>
                <p className={`text-[11px] shrink-0 ${c.unread > 0 ? 'text-brand font-bold' : 'text-mute'}`}>{timeAgo(c.last_time)}</p>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <p className={`text-[13px] truncate ${c.unread > 0 ? 'text-navy font-semibold dark:text-white' : 'text-mute'}`}>
                  {c.last_sender === userId ? 'You: ' : ''}{c.last_message}
                </p>
                {c.unread > 0 && (
                  <span className="bg-brand text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 ml-2">
                    {c.unread > 9 ? '9+' : c.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
    }
