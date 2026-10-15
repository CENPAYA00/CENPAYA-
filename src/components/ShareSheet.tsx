import { useEffect, useState } from 'react';
import { X, Search, Users, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

type Target = {
  id: string;         // channel_id OR group id
  kind: 'chat' | 'group' | 'user';
  username: string;
  avatar?: string | null;
};

export default function ShareSheet({
  postId, onClose,
}: { postId: string; onClose: () => void }) {
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
        const { data: myChannels } = await supabase.from('chat_participants').select('channel_id').eq('user_id', me.id);
        const ids = (myChannels || []).map((c: any) => c.channel_id);
        if (ids.length > 0) {
          const { data: others } = await supabase.from('chat_participants').select('channel_id, user_id').in('channel_id', ids).neq('user_id', me.id);
          const otherIds = [...new Set((others || []).map((o: any) => o.user_id))];
          const { data: profiles } = await supabase.from('public_profiles').select('id, username').in('id', otherIds);
          const map: Record<string, string> = {};
          (profiles || []).forEach((p: any) => { map[p.id] = p.username; });
          list = (others || []).map((o: any) => ({
            id: o.channel_id, kind: 'chat', username: map[o.user_id] || 'User',
          }));
        }
      } else if (tab === 'groups') {
        const { data } = await supabase.rpc('list_my_groups');
        list = (Array.isArray(data) ? data : []).map((g: any) => ({
          id: g.id, kind: 'group', username: g.name, avatar: g.avatar_url,
        }));
      } else {
        // friends = mutual follows
        const { data } = await supabase.rpc('get_following', { p_user_id: me.id, p_limit: 200 });
        list = (Array.isArray(data) ? data : []).map((u: any) => ({
          id: u.id, kind: 'user', username: u.username, avatar: u.avatar_url,
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
      if (t.kind === 'chat') {
        await supabase.from('chat_messages').insert({
          channel_id: t.id, sender_id: me.id,
          body: '📎 Shared a post', message_type: 'shared_post', shared_post_id: postId,
        });
      } else if (t.kind === 'group') {
        // Assumes group has an underlying chat channel with same id.
        await supabase.from('chat_messages').insert({
          channel_id: t.id, sender_id: me.id,
          body: '📎 Shared a post', message_type: 'shared_post', shared_post_id: postId,
        });
      } else {
        // DM: find or create channel
        const { data } = await supabase.rpc('get_or_create_dm_channel', { p_other_user_id: t.id });
        const channelId = data?.channel_id;
        if (channelId) {
          await supabase.from('chat_messages').insert({
            channel_id: channelId, sender_id: me.id,
            body: '📎 Shared a post', message_type: 'shared_post', shared_post_id: postId,
          });
        }
      }
      onClose();
    } catch (e) {
      console.warn('share failed', e);
    } finally {
      setSending(null);
    }
  };

  const filtered = targets.filter(t => t.username.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[80vh] overflow-y-auto animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard z-10">
          <p className="text-[13px] font-bold text-navy dark:text-white">Share to...</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex border-b border-gray-100 dark:border-darkline">
          {(['chats', 'groups', 'friends'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[11px] font-bold border-b-2 ${
                tab === t ? 'text-accent border-accent' : 'text-gray-500 border-transparent'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="relative m-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-xs"
          />
        </div>

        {loading && <p className="p-6 text-center text-[10px] text-gray-500">Loading...</p>}
        {!loading && filtered.length === 0 && <p className="p-6 text-center text-[10px] text-gray-500">No targets</p>}

        {filtered.map(t => (
          <button
            key={t.id}
            disabled={!!sending}
            onClick={() => send(t)}
            className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-darkline last:border-b-0 disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold overflow-hidden">
              {t.avatar
                ? <img src={t.avatar} className="w-9 h-9 object-cover" alt="" />
                : t.kind === 'group' ? <Users size={14} /> : (t.username?.[0]?.toUpperCase() || 'U')}
            </div>
            <span className="flex-1 text-left text-[12px] font-bold text-navy dark:text-white truncate">{t.username}</span>
            <Send size={14} className="text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  );
                                                         }
