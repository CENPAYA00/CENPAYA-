import { useEffect, useState } from 'react';
import { X, Search, Users, Send, Loader2 } from 'lucide-react';
import { d1Request } from '../lib/d1Api';
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
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        let list: Target[] = [];
        if (tab === 'chats') {
          const result = await d1Request<{ data: any[] }>('/api/chat/threads');
          list = (result.data || []).map((row: any) => ({
            id: row.id, kind: 'chat' as const, username: row.other_username || row.title || 'Conversation', avatar: row.other_avatar,
          }));
        } else if (tab === 'groups') {
          const result = await d1Request<{ data: any[] }>('/api/groups');
          list = (result.data || []).map((g: any) => ({ id: g.id, kind: 'group' as const, username: g.name, avatar: g.avatar_url }));
        } else {
          const result = await d1Request<{ data: any[] }>('/api/me/following');
          list = (result.data || []).map((u: any) => ({ id: u.id, kind: 'user' as const, username: u.username, avatar: u.avatar_url }));
        }
        if (active) setTargets(list);
      } catch (error: any) { if (active) console.warn(error.message || 'Could not load share targets'); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [tab]);

  const send = async (target: Target) => {
    setSending(target.id);
    const me = await getCachedUser();
    if (!me) { setSending(null); return; }
    try {
      if (target.kind === 'chat') {
        await d1Request(`/api/chat/threads/${encodeURIComponent(target.id)}/messages`, { method: 'POST', body: JSON.stringify({ message_text: '📎 Shared a post', message_type: 'shared_post', shared_post_id: postId }) });
      } else if (target.kind === 'group') {
        await d1Request(`/api/groups/${encodeURIComponent(target.id)}/messages`, { method: 'POST', body: JSON.stringify({ message_text: '📎 Shared a post', message_type: 'shared_post', shared_post_id: postId }) });
      } else {
        const result = await d1Request<{ id: string }>('/api/chat/direct', { method: 'POST', body: JSON.stringify({ user_id: target.id }) });
        await d1Request(`/api/chat/threads/${encodeURIComponent(result.id)}/messages`, { method: 'POST', body: JSON.stringify({ message_text: '📎 Shared a post', message_type: 'shared_post', shared_post_id: postId }) });
      }
      await logActivity('post_shared', { post_id: postId, to: target.kind });
      onShared?.();
      onClose();
    } catch (error: any) { console.warn('share failed', error); alert(error.message || 'Could not share post'); }
    finally { setSending(null); }
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
