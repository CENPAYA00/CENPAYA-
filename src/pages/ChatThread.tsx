import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Mic, Play, Pause, Trash2, MoreVertical, Palette, ChevronDown } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { useReadReceipts } from '../hooks/useReadReceipts';
import { useDemoAutoReply } from '../hooks/useDemoAutoReply';
import { useSound } from '../contexts/sound';
import SharedPostCard from '../components/SharedPostCard';
import ReadReceipt from '../components/ReadReceipt';
import ChatMenus from '../components/ChatMenus';
import { resolveTheme } from '../lib/chatThemes';

// Helper for Day Dividers (Today, Yesterday)
function dayLabel(iso: string) {
  const d = new Date(iso), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// MEMOIZED BUBBLE: Stops every message from re-rendering when you type
const ChatBubble = React.memo(({ m, mine, theme, playingId, togglePlay, setActionMessage }: any) => {
  const isVoice = m.message_type === 'voice_note';
  const isPending = String(m.id).startsWith('temp-');
  
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        onClick={() => !isPending && setActionMessage(m)}
        className={`max-w-[80%] rounded-2xl text-[15px] ${isPending ? 'opacity-70' : ''} ${
          mine ? `${theme.bubbleMine} rounded-br-sm` : `${theme.bubbleTheirs} ${theme.bubbleTheirsDark} rounded-bl-sm shadow-sm`
        } px-4 py-2.5`}
      >
        {isVoice ? (
          <button onClick={(e) => { e.stopPropagation(); togglePlay(m); }} className="flex items-center gap-3 min-w-[140px]">
            {playingId === m.id ? <Pause size={18} /> : <Play size={18} />}
            <div className="flex items-center gap-0.5">{[0,1,2,3,4].map(i => <span key={i} className="wave-bar w-0.5 h-3.5 bg-current opacity-80" />)}</div>
            <span className="text-[12px] opacity-80">{m.media_duration_seconds || 0}s</span>
          </button>
        ) : ( m.body )}
        {mine && (
          <div className="flex justify-end mt-1">
            {m.status === 'failed' ? <span className="text-[9px] text-red-300">Failed</span> : isPending ? <span className="w-2 h-2 rounded-full bg-white/50 animate-pulse" /> : <ReadReceipt delivered={!!m.delivered_at} read={!!m.read_at} />}
          </div>
        )}
      </div>
    </div>
  );
});
ChatBubble.displayName = 'ChatBubble';

export default function ChatThread() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { play } = useSound();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [actionMessage, setActionMessage] = useState<any>(null);
  const [themeKey, setThemeKey] = useState('emerald');
  const [isAway, setIsAway] = useState(false); // Scroll-to-bottom tracking
  
  const parentRef = useRef<HTMLDivElement>(null);
  const recordStartRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorder = useVoiceRecorder();

  useReadReceipts(id, userId);
  useDemoAutoReply({ channelId: id, otherUsername: otherUser?.username, messages, myUserId: userId });
  const theme = resolveTheme(themeKey as any);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const load = async () => {
      const me = await getCachedUser();
      if (!me || !id) { setLoading(false); return; }
      setUserId(me.id);

      const [othersRes, participantRes, msgsRes] = await Promise.all([
        supabase.from('chat_participants').select('user_id').eq('channel_id', id).neq('user_id', me.id).maybeSingle(),
        supabase.from('chat_participants').select('chat_theme').eq('channel_id', id).eq('user_id', me.id).maybeSingle(),
        supabase.from('chat_messages').select('*').eq('channel_id', id).order('created_at', { ascending: false }).limit(40)
      ]);

      if (othersRes.data?.user_id) {
        const { data: p } = await supabase.from('public_profiles').select('id, username').eq('id', othersRes.data.user_id).maybeSingle();
        setOtherUser(p);
      }
      if (participantRes.data?.chat_theme) setThemeKey(participantRes.data.chat_theme);
      
      setMessages((msgsRes.data || []).reverse());
      setLoading(false);

      const sub = supabase.channel(`chat_${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${id}` }, (payload: any) => {
          setMessages(prev => prev.some(x => x.id === payload.new.id) ? prev : [...prev, payload.new]);
          if (payload.new.sender_id !== me.id) play('message_received');
        }).subscribe();
      cleanup = () => { supabase.removeChannel(sub); };
    };
    load();
    return () => { cleanup?.(); };
  }, [id, play]);

  // BUILD ROWS WITH DAY DIVIDERS
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

  // Virtualizer
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

  const onScroll = () => {
    const el = parentRef.current; if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    setIsAway(!nearBottom);
  };

  const handleSend = async () => {
    if (!input.trim() || !userId) return;
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = { id: tempId, channel_id: id, sender_id: userId, body: input.trim(), message_type: 'text', created_at: new Date().toISOString(), status: 'sending' };
    setMessages(prev => [...prev, optimisticMsg]);
    setInput('');
    play('message_sent');
    setIsAway(false); // scroll to bottom immediately

    const { data, error } = await supabase.from('chat_messages').insert({ channel_id: id, sender_id: userId, body: optimisticMsg.body, message_type: 'text' }).select().single();
    if (data && !error) setMessages(prev => prev.map(m => m.id === tempId ? { ...data, status: 'sent' } : m));
    else setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
  };

  const startRecording = async () => {
    const ok = await recorder.start();
    if (ok) { setIsRecording(true); recordStartRef.current = Date.now(); }
  };

  const sendRecording = async () => {
    const blob = await recorder.stop();
    setIsRecording(false);
    const duration = Math.round((Date.now() - recordStartRef.current) / 1000);
    if (!blob || !userId || duration < 1 || !id) return;

    const localUrl = URL.createObjectURL(blob);
    const tempId = `temp-voice-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, channel_id: id, sender_id: userId, body: '🎤 Voice note', message_type: 'voice_note', media_url: localUrl, media_duration_seconds: duration, created_at: new Date().toISOString(), status: 'sending' }]);

    const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
    const path = `voice/${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('chat-media').upload(path, blob, { contentType: blob.type });

    if (upErr) return;
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    
    const { data, error } = await supabase.from('chat_messages').insert({ channel_id: id, sender_id: userId, body: '🎤 Voice note', message_type: 'voice_note', media_url: urlData.publicUrl, media_duration_seconds: duration }).select().single();
    if (data && !error) setMessages(prev => prev.map(m => m.id === tempId ? { ...data, status: 'sent' } : m));
    setIsAway(false);
  };

  const togglePlay = useCallback((m: any) => {
    if (playingId === m.id) { audioRef.current?.pause(); setPlayingId(null); return; }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(m.media_url || m.voice_note_url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(m.id);
  }, [playingId]);

  if (loading) return <div className="p-4 text-center text-xs text-mute">Loading...</div>;

  return (
    <div className={`flex flex-col h-[100dvh] fixed inset-0 z-[100] ${theme.bg} ${theme.bgDark}`}>
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3 flex items-center gap-3 shrink-0 shadow-md z-20">
        <button onClick={() => navigate('/chat')} className="cursor-pointer"><ArrowLeft size={20} /></button>
        <div className="w-10 h-10 bg-white/15 rounded-full flex items-center justify-center text-sm font-bold">
          {otherUser?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-bold">@{otherUser?.username || 'Chat'}</p>
        </div>
        <button onClick={() => setShowThemePicker(true)} className="mr-2 cursor-pointer"><Palette size={20} /></button>
        <button onClick={() => setShowChatMenu(true)} className="cursor-pointer"><MoreVertical size={20} /></button>
      </header>

      <main ref={parentRef} className="flex-1 overflow-y-auto p-4 relative" onScroll={onScroll} style={{ overscrollBehavior: 'contain' }}>
        <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const r = rows[virtualRow.index];
            return (
              <div key={r.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, paddingBottom: '8px' }}>
                
                {r.kind === 'day' ? (
                  <div className="flex justify-center py-2">
                    <span className="bg-white/80 dark:bg-black/40 text-mute text-[12px] font-bold px-3 py-1 rounded-full shadow-sm">{r.label}</span>
                  </div>
                ) : (
                  <ChatBubble m={r.msg} mine={r.msg.sender_id === userId} theme={theme} playingId={playingId} togglePlay={togglePlay} setActionMessage={setActionMessage} />
                )}
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

      {isRecording && (
        <div className="bg-red-500 text-white px-4 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => { recorder.cancel(); setIsRecording(false); }}><Trash2 size={18} /></button>
          <div className="flex-1 flex items-center gap-2"><span className="w-2 h-2 bg-white rounded-full animate-pulse" /><span className="text-sm font-bold">Recording...</span></div>
          <button onClick={sendRecording} className="bg-white text-red-500 rounded-full w-10 h-10 flex items-center justify-center"><Send size={16} /></button>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline p-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] flex gap-3 shrink-0 z-20">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." className="flex-1 px-5 py-3 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-pill text-[15px] outline-none" />
        {input.trim() ? (
          <button type="submit" className="text-white rounded-full w-12 h-12 flex items-center justify-center shrink-0" style={{ background: theme.accent }}>
            <Send size={18} />
          </button>
        ) : (
          <button type="button" onPointerDown={(e) => { e.preventDefault(); startRecording(); }} onPointerUp={(e) => { e.preventDefault(); sendRecording(); }} onPointerCancel={() => { recorder.cancel(); setIsRecording(false); }} className="text-white rounded-full w-12 h-12 flex items-center justify-center shrink-0" style={{ background: theme.accent }}>
            <Mic size={18} />
          </button>
        )}
      </form>

      <ChatMenus showChatMenu={showChatMenu} setShowChatMenu={setShowChatMenu} showThemePicker={showThemePicker} setShowThemePicker={setShowThemePicker} actionMessage={actionMessage} setActionMessage={setActionMessage} otherUser={otherUser} themeKey={themeKey} applyTheme={async (k) => { setThemeKey(k); await supabase.from('chat_participants').update({ chat_theme: k }).eq('channel_id', id).eq('user_id', userId); }} />
    </div>
  );
}
