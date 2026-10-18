import { useEffect, useState } from 'react';
import { X, Search, Users, Send, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { logActivity } from '../lib/activityLog';

type Target = {
  id: string;
  kind: 'chat' | 'group' | 'user';
  username: string;
  avatar?: string | null;
};

type Props = {
  postId: string;
  onClose: () => void;
  onShared?: () => void;
};

export default function ShareSheet({ postId, onClose, onShared }: Props) {
  const [tab, setTab] = useState<'chats' | 'groups' | 'friends'>('chats');
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      let list: Target[] = [];

      if (tab === 'chats') {
        const { data: myChannels } = await supabase
          .from('chat_participants')
          .select('channel_id')
          .eq('user_id', me.id);

        const ids = (myChannels || []).map((c: any) => c.channel_id);

        if (ids.length > 0) {
          const { data: others } = await supabase
            .from('chat_participants')
            .select('channel_id, user_id')
            .in('channel_id', ids)
            .neq('user_id', me.id);

          const otherIds = [...new Set((others || []).map((o: any) => o.user_id))];

          const { data: profiles } = await supabase
            .from('public_profiles')
            .select('id, username, avatar_url')
            .in('id', otherIds);

          const map: Record<string, any> = {};
          (profiles || []).forEach((p: any) => { map[p.id] = { username: p.username, avatar: p.avatar_url }; });

          list = (others || []).map((o: any) => ({
            id: o.channel_id,
            kind: 'chat' as const,
            username: map[o.user_id]?.username || 'User',
            avatar: map[o.user_id]?.avatar || null,
          }));
        }
      } else if (tab === 'groups') {
        const { data } = await supabase.rpc('list_my_groups');
        list = (Array.isArray(data) ? data : []).map((g: any) => ({
          id: g.id,
          kind: 'group' as const,
          username: g.name,
          avatar: g.avatar_url,
        }));
      } else {
        const { data } = await supabase.rpc('get_following', { p_user_id: me.id, p_limit: 200 });
        list = (Array.isArray(data) ? data : []).map((u: any) => ({
          id: u.id,
          kind: 'user' as const,
          username: u.username,
          avatar: u.avatar_url,
        }));
      }

      setTargets(list);
      setLoading(false);
    };
    load();
  }, [tab]);

  const send = async (t: Target) => {
    setSending(t.id);
    const me = await getCachedUser();
    if (!me) { setSending(null); return; }

    try {
      if (t.kind === 'chat' || t.kind === 'group') {
        await supabase.from('chat_messages').insert({
          channel_id: t.id,
          sender_id: me.id,
          body: '📎 Shared a post',
          message_type: 'shared_post',
          shared_post_id: postId,
        });
      } else {
        // DM: find or create a channel with this user
        const { data } = await supabase.rpc('get_or_create_dm_channel', { p_other_user_id: t.id });
        const channelId = data?.channel_id;
        if (channelId) {
          await supabase.from('chat_messages').insert({
            channel_id: channelId,
            sender_id: me.id,
            body: '📎 Shared a post',
            message_type: 'shared_post',
            shared_post_id: postId,
          });
        }
      }

      await logActivity('post_shared', { post_id: postId, to: t.kind });
      onShared?.();
      onClose();
    } catch (e) {
      console.warn('share failed', e);
    } finally {
      setSending(null);
    }
  };

  const filtered = targets.filter(t =>
    t.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full bg-white dark:bg-darkcard rounded-t-3xl max-h-[85vh] flex flex-col animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard z-10 rounded-t-3xl">
          <p className="text-[16px] font-bold text-navy dark:text-white">Share to...</p>
          <button onClick={onClose} className="cursor-pointer bg-gray-100 dark:bg-darkline p-1.5 rounded-full"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-darkline">
          {(['chats', 'groups', 'friends'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-[13px] font-bold border-b-2 cursor-pointer transition-colors ${
                tab === t ? 'text-[#12935a] border-[#12935a]' : 'text-gray-500 border-transparent hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="p-4 pb-2">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full pl-11 pr-4 py-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[14px] text-navy dark:text-white outline-none focus:border-[#12935a]"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {loading && <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-[#12935a]" size={24} /></div>}

          {!loading && filtered.length === 0 && (
            <p className="p-8 text-center text-[14px] text-gray-500">
              {tab === 'chats' && 'No conversations yet'}
              {tab === 'groups' && 'No groups yet'}
              {tab === 'friends' && 'No friends yet'}
            </p>
          )}

          {filtered.map(t => (
            <button
              key={t.id}
              disabled={!!sending}
              onClick={() => send(t)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50 cursor-pointer transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-[#12935a]/10 flex items-center justify-center text-[#12935a] font-bold overflow-hidden shrink-0">
                {t.avatar ? (
                  <img src={t.avatar} className="w-12 h-12 object-cover" alt="" />
                ) : t.kind === 'group' ? (
                  <Users size={20} />
                ) : (
                  t.username?.[0]?.toUpperCase() || 'U'
                )}
              </div>
              <span className="flex-1 text-left text-[15px] font-bold text-navy dark:text-white truncate">
                {t.username}
              </span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                {sending === t.id ? (
                  <Loader2 size={18} className="text-[#12935a] animate-spin" />
                ) : (
                  <Send size={18} className="text-gray-400" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
      }
