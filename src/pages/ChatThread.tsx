import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MoreVertical, Palette, ChevronDown } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { useReadReceipts } from '../hooks/useReadReceipts';
import { useDemoAutoReply } from '../hooks/useDemoAutoReply';
import { useSound } from '../contexts/sound';
import ReadReceipt from '../components/ReadReceipt';
import ChatMenus from '../components/ChatMenus';
import { VoiceBubble, SharedPostCard } from '../components/ChatMedia';
import { RichComposer } from '../components/RichComposer';
import { resolveTheme, ChatThemeKey } from '../lib/chatThemes';

const BUCKET = 'chat-media';

async function compressImage(file: File, max = 1280, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("compress failed"))), "image/jpeg", quality));
}

async function upload(blob: Blob, folder: string, ext: string, tries = 3): Promise<string> {
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  for (let i = 0; i < tries; i++) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || undefined, cacheControl: "31536000" });
    if (!error) return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
  throw new Error("upload failed");
}

function dayLabel(iso: string) {
  const d = new Date(iso), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ChatThread() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { play } = useSound();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [actionMessage, setActionMessage] = useState<any>(null);
  const [themeKey, setThemeKey] = useState<ChatThemeKey>('emerald'); 
  const [isAway, setIsAway] = useState(false); 
  const [postPreviews, setPostPreviews] = useState<Record<string, any>>({});
  
  const parentRef = useRef<HTMLDivElement>(null);

  useReadReceipts(id, userId);
  useDemoAutoReply({ channelId: id, otherUsername: otherUser?.username, messages, myUserId: userId });
  const theme = resolveTheme(themeKey);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const me = session?.user;
      if (!me || !id) { setLoading(false); return; }
      setUserId(me.id);

      const [othersRes, participantRes, msgsRes] = await Promise.all([
        supabase.from('chat_participants').select('user_id').eq('channel_id', id).neq('user_id', me.id).maybeSingle(),
        supabase.from('chat_participants').select('chat_theme').eq('channel_id', id).eq('user_id', me.id).maybeSingle(),
        supabase.from('chat_messages').select('*').eq('channel_id', id).order('created_at', { ascending: false }).limit(40)
      ]);

      if (othersRes.data?.user_id) {
        const { data: p } = await supabase.from('public_profiles').select('id, username, avatar_url').eq('id', othersRes.data.user_id).maybeSingle();
        setOtherUser(p);
      }
      if (participantRes.data?.chat_theme) setThemeKey(participantRes.data.chat_theme as ChatThemeKey); 
      
      const initialMessages = (msgsRes.data || []).reverse();
      setMessages(initialMessages);
      setLoading(false);

      const sharedIds = initialMessages.filter(m => m.message_type === 'shared_post' && m.shared_post_id).map(m => m.shared_post_id);
      if (sharedIds.length > 0) {
        const { data: posts } = await supabase.from('posts').select('id, content, image_url, profiles:public_profiles(username, avatar_url)').in('id', sharedIds);
        const map: Record<string, any> = {};
        (posts || []).forEach(p => { map[p.id] = { ...p, username: p.profiles?.username, avatar_url: p.profiles?.avatar_url }; });
        setPostPreviews(map);
      }

      const sub = supabase.channel(`chat_${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${id}` }, (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new;
            setMessages(prev => {
              if (prev.some(x => x.id === newMsg.id)) return prev;
              const tempIdx = prev.findIndex(x => String(x.id).startsWith('temp-') && x.sender_id === newMsg.sender_id && x.body === newMsg.body);
              if (tempIdx >= 0) {
                const copy = [...prev];
                copy[tempIdx] = { ...newMsg, status: 'sent' };
                return copy;
              }
              return [...prev, newMsg];
            });
            if (newMsg.sender_id !== me.id) play('message_received');
          } 
          else if (payload.eventType === 'UPDATE') {
            const updated = payload.new;
            setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, read_at: updated.read_at, delivered_at: updated.delivered_at } : m));
          }
        }).subscribe();
      cleanup = () => { supabase.removeChannel(sub); };
    };
    load();
    return () => { cleanup?.(); };
  }, [id, play]);

  const handleSendText = async (text: string) => {
    if (!text.trim() || !userId) return;
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, channel_id: id, sender_id: userId, body: text, message_type: 'text', created_at: new Date().toISOString(), status: 'sending' }]);
    setIsAway(false);
    const { data, error } = await supabase.from('chat_messages').insert({ channel_id: id, sender_id: userId, body: text, message_type: 'text' }).select().single();
    if (data && !error) setMessages(prev => prev.map(m => m.id === tempId ? { ...data, status: 'sent' } : m));
    else setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
  };

  const handleSendImages = async (files: File[]) => {
    if (!userId) return;
    for (const f of files.slice(0, 10)) {
      const local = URL.createObjectURL(f);
      const tempId = `temp-img-${Date.now()}`;
      setMessages(prev => [...prev, { id: tempId, channel_id: id, sender_id: userId, body: '', message_type: 'image', media_url: local, created_at: new Date().toISOString(), status: 'sending' }]);
      setIsAway(false);
      try {
        const compressed = await compressImage(f);
        const url = await upload(compressed, `chat/${id}/images`, 'jpg');
        const { data } = await supabase.from('chat_messages').insert({ channel_id: id, sender_id: userId, body: '', message_type: 'image', media_url: url }).select().single();
        if (data) setMessages(prev => prev.map(m => m.id === tempId ? { ...data, status: 'sent' } : m));
      } catch {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      }
    }
  };

  const handleSendVoice = async (blob: Blob, durationMs: number) => {
    if (!userId) return;
    const local = URL.createObjectURL(blob);
    const tempId = `temp-voice-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, channel_id: id, sender_id: userId, body: '', message_type: 'voice_note', media_url: local, media_duration_seconds: durationMs / 1000, created_at: new Date().toISOString(), status: 'sending' }]);
    setIsAway(false);
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const url = await upload(blob, `chat/${id}/voice`, ext);
      const { data } = await supabase.from('chat_messages').insert({ channel_id: id, sender_id: userId, body: '', message_type: 'voice_note', media_url: url, media_duration_seconds: durationMs / 1000 }).select().single();
      if (data) setMessages(prev => prev.map(m => m.id === tempId ? { ...data, status: 'sent' } : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const rows = useMemo(() => {
    const r: any[] = [];
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
      if (newDay) r.push({ kind: 'day', key: `d-${m.created_at}`, label: dayLabel(m.created_at) });
      r.push({ kind: 'msg', key: m.id, msg: m });
    });
    return r;
  }, [messages]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'day' ? 40 : 60),
    overscan: 5,
  });

  const scrollToBottom = useCallback((smooth = false) => {
    if (rows.length) rowVirtualizer.scrollToIndex(rows.length - 1, { align: 'end', behavior: smooth ? 'smooth' : 'auto' });
  }, [rows.length, rowVirtualizer]);

  useEffect(() => {
    if (!isAway && rows.length > 0) scrollToBottom();
  }, [rows.length, scrollToBottom, isAway]);

  if (loading) return <div className="p-4 text-center text-xs text-mute">Loading...</div>;

  return (
    <div className={`flex flex-col h-[100dvh] fixed inset-0 z-[100] ${theme.bg} ${theme.bgDark}`}>
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3 flex items-center gap-3 shrink-0 shadow-md z-20">
        <button onClick={() => navigate('/chat')} className="cursor-pointer"><ArrowLeft size={20} /></button>
        <div className="w-10 h-10 bg-white/15 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden">
          {otherUser?.avatar_url ? <img src={otherUser.avatar_url} className="w-full h-full object-cover" /> : otherUser?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-bold">@{otherUser?.username || 'Chat'}</p>
        </div>
        <button onClick={() => setShowThemePicker(true)} className="mr-2 cursor-pointer"><Palette size={20} /></button>
        <button onClick={() => setShowChatMenu(true)} className="cursor-pointer"><MoreVertical size={20} /></button>
      </header>

      <main ref={parentRef} className="flex-1 overflow-y-auto p-4 relative" onScroll={() => setIsAway(parentRef.current!.scrollHeight - parentRef.current!.scrollTop - parentRef.current!.clientHeight > 150)} style={{ overscrollBehavior: 'contain' }}>
        <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const r = rows[virtualRow.index];
            if (r.kind === 'day') {
              return (
                <div key={r.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, paddingBottom: '8px' }}>
                  <div className="flex justify-center py-2"><span className="bg-white/80 dark:bg-black/40 text-mute text-[12px] font-bold px-3 py-1 rounded-full shadow-sm">{r.label}</span></div>
                </div>
              );
            }

            const m = r.msg;
            const mine = m.sender_id === userId;
            const isPending = String(m.id).startsWith('temp-');
            const isFailed = m.status === 'failed';

            return (
              <div key={r.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, paddingBottom: '8px' }}>
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    onClick={() => !isPending && setActionMessage(m)}
                    className={`max-w-[80%] rounded-2xl text-[15px] ${isPending ? 'opacity-70' : ''} ${
                      mine ? `${theme.bubbleMine} rounded-br-sm` : `${theme.bubbleTheirs} ${theme.bubbleTheirsDark} rounded-bl-sm shadow-sm`
                    } ${m.message_type === 'shared_post' || m.message_type === 'image' ? 'p-1.5' : 'px-4 py-2.5'}`}
                  >
                    {m.message_type === 'voice_note' && m.media_url ? (
                      <VoiceBubble src={m.media_url} duration={m.media_duration_seconds || 0} />
                    ) : m.message_type === 'image' && m.media_url ? (
                      <img src={m.media_url} className="w-48 h-48 object-cover rounded-xl" />
                    ) : m.message_type === 'shared_post' && m.shared_post_id ? (
                      <SharedPostCard post={postPreviews[m.shared_post_id] || { username: 'User' }} onOpen={() => navigate(`/post/${m.shared_post_id}`)} />
                    ) : (
                      // ADDED: data-no-translate to chat message body
                      <span data-no-translate>{m.body}</span>
                    )}

                    {mine && (
                      <div className="flex justify-end mt-1">
                        {isFailed ? <span className="text-[9px] text-red-300">Failed</span> : isPending ? <span className="w-2 h-2 rounded-full bg-white/50 animate-pulse" /> : <ReadReceipt delivered={!!m.delivered_at || true} read={!!m.read_at} />}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {isAway && (
        <button onClick={() => { setIsAway(false); scrollToBottom(true); }} className="absolute right-6 bottom-24 w-12 h-12 bg-white dark:bg-darkcard rounded-full shadow-lg flex items-center justify-center text-brand z-30">
          <ChevronDown size={24} />
        </button>
      )}

      <RichComposer 
        onSendText={handleSendText} 
        onPickImages={handleSendImages} 
        onVoice={handleSendVoice} 
      />

      <ChatMenus 
        showChatMenu={showChatMenu} setShowChatMenu={setShowChatMenu} 
        showThemePicker={showThemePicker} setShowThemePicker={setShowThemePicker} 
        actionMessage={actionMessage} setActionMessage={setActionMessage} 
        otherUser={otherUser} themeKey={themeKey} 
        applyTheme={async (k: ChatThemeKey) => { setThemeKey(k); await supabase.from('chat_participants').update({ chat_theme: k }).eq('channel_id', id).eq('user_id', userId); }} 
      />
    </div>
  );
}
