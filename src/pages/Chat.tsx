import { useState, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MessageCircle, Bell, Inbox, CheckCheck } from 'lucide-react';
import DemoBadge from '../components/DemoBadge';
import { useQuery } from '@tanstack/react-query';
import { enablePush } from '../lib/push';
import { d1Request } from '../lib/d1Api';

type ChatRow = {
  id: string;
  other_user_id: string;
  other_username: string;
  other_avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread_count: number;
  is_demo?: boolean;
  other_user_id?: string;
  other_last_active_at?: string | null;
};

export default function Chat() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [pushState, setPushState] = useState('default');
  const [starting, setStarting] = useState<string | null>(null);
  const [inboxTab, setInboxTab] = useState<'all' | 'unread'>('all');
  const deferredSearch = useDeferredValue(search);

  const { data: user } = useQuery({
    queryKey: ['d1-me-chat'],
    queryFn: async () => (await d1Request<{ user: { id: string } }>('/api/me')).user,
  });
  const userId = user?.id || null;

  const { data: channels = [], isLoading } = useQuery<ChatRow[]>({
    queryKey: ['d1-chat-list', userId],
    enabled: !!userId,
    queryFn: async () => {
      const result = await d1Request<{ data: ChatRow[] }>('/api/chat/threads');
      return result.data || [];
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const { data: contacts = [] } = useQuery<any[]>({
    queryKey: ['d1-chat-contacts', userId],
    enabled: !!userId,
    queryFn: async () => {
      const result = await d1Request<{ data: any[] }>('/api/profiles/suggestions');
      return result.data || [];
    },
  });

  const startConversation = async (otherUserId: string) => {
    setStarting(otherUserId);
    try {
      const result = await d1Request<{ id: string }>('/api/chat/direct', {
        method: 'POST', body: JSON.stringify({ user_id: otherUserId }),
      });
      if (!result.id) throw new Error('Conversation was not created');
      navigate(`/chat/${result.id}`);
    } catch (error: any) { alert(error.message || 'Could not start conversation'); }
    finally { setStarting(null); }
  };

  const filtered = channels.filter(c => ((c.other_username || '').toLowerCase().includes(deferredSearch.toLowerCase()) || (c.last_message || '').toLowerCase().includes(deferredSearch.toLowerCase()))).filter(c => inboxTab === 'all' || c.unread_count > 0);
  const filteredContacts = contacts.filter(c => (c.username || '').toLowerCase().includes(deferredSearch.toLowerCase()));
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
  return <div className="px-4 py-3 pb-24">
    <h1 className="text-[22px] font-bold text-navy dark:text-white mb-4">Messages</h1>
    {pushState === 'default' && <div className="bg-[#eaf6ef] dark:bg-[#12935a]/10 border border-[#12935a]/20 rounded-xl p-3 flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 text-[#0a3d2b] dark:text-white"><Bell size={18} className="text-[#12935a]" /><span className="text-[13px] font-bold">Get notified of new messages</span></div>
      <button onClick={async () => { if (userId) setPushState(await enablePush(userId)); }} className="bg-[#12935a] text-white text-[12px] font-bold px-3 py-1.5 rounded-lg">Turn on</button>
    </div>}
    <div className="relative mb-3"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search messages or people..." className="w-full pl-11 pr-4 py-3.5 border border-gray-200 dark:border-darkline rounded-pill bg-white dark:bg-darkcard text-[14px] text-ink outline-none" /></div>
    <div className="flex gap-2 mb-3">
      <button onClick={() => setInboxTab('all')} className={`flex-1 rounded-xl py-2 text-[11px] font-bold flex items-center justify-center gap-1.5 ${inboxTab==='all'?'bg-brand text-white':'bg-white dark:bg-darkcard text-gray-500'}`}><Inbox size={13}/> All chats</button>
      <button onClick={() => setInboxTab('unread')} className={`flex-1 rounded-xl py-2 text-[11px] font-bold flex items-center justify-center gap-1.5 ${inboxTab==='unread'?'bg-brand text-white':'bg-white dark:bg-darkcard text-gray-500'}`}><CheckCheck size={13}/> Unread {channels.filter(c=>c.unread_count>0).length>0&&<span>({channels.filter(c=>c.unread_count>0).length})</span>}</button>
    </div>
    {filteredContacts.length>0&&<div className="mb-4"><p className="text-[10px] font-bold text-gray-500 mb-2 uppercase">People to message</p><div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide">
      {filteredContacts.map((c:any)=><button key={c.id} disabled={starting===c.id} onClick={()=>startConversation(c.id)} className="flex flex-col items-center gap-1.5 shrink-0 disabled:opacity-50"><div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold overflow-hidden">{c.avatar_url?<img src={c.avatar_url} className="w-full h-full object-cover" />:(c.username||'U')[0].toUpperCase()}</div><span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 truncate w-14 text-center">{starting===c.id?'...':(c.username||'User').split('_')[0]}</span></button>)}
    </div></div>}
    <div className="bg-white dark:bg-darkcard rounded-card shadow-soft overflow-hidden">
      {filtered.length===0&&<div className="p-8 text-center text-mute"><MessageCircle size={32} className="mx-auto mb-3 opacity-50" /><p className="text-[14px] font-bold text-navy dark:text-white">{inboxTab==='unread'?'No unread messages':'No messages yet'}</p><p className="text-[12px]">{inboxTab==='unread'?'You are all caught up.':'Choose someone above to start a conversation.'}</p></div>}
      {filtered.map((c,i)=><button key={c.id} onClick={()=>navigate(`/chat/${c.id}`)} className={`w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-white/5 ${i!==filtered.length-1?'border-b border-gray-100 dark:border-darkline':''}`}>
        <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-xl shrink-0 overflow-hidden">{c.other_avatar?<img src={c.other_avatar} className="w-full h-full object-cover" />:(c.other_username||'U')[0].toUpperCase()}</div>
        <div className="flex-1 min-w-0"><div className="flex justify-between items-baseline gap-2"><div className="flex items-center gap-1.5"><p className="text-[15px] font-bold text-navy dark:text-white truncate">@{c.other_username||'User'}</p>{c.is_demo&&<DemoBadge />}</div><p className={`text-[11px] shrink-0 ${c.unread_count>0?'text-brand font-bold':'text-mute'}`}>{timeAgo(c.last_message_at)}</p></div>
          <div className="flex items-center justify-between mt-0.5"><p className={`text-[13px] truncate ${c.unread_count>0?'text-navy font-semibold dark:text-white':'text-mute'}`}>{c.last_sender_id===userId?'You: ':''}{c.last_message||'No messages yet'}</p>{c.unread_count>0&&<span className="bg-brand text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 ml-2">{c.unread_count>9?'9+':c.unread_count}</span>}</div>
        </div>
      </button>)}
    </div>
  </div>;
}
