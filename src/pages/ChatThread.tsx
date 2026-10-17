import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Send, Mic, Play, Pause, Trash2, MoreVertical,
  Clock, Palette, Phone
} from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { useReadReceipts } from '../hooks/useReadReceipts';
import { useDemoAutoReply } from '../hooks/useDemoAutoReply';
import { useSound } from '../contexts/sound';
import SharedPostCard from '../components/SharedPostCard';
import ReportSheet from '../components/ReportSheet';
import ReadReceipt from '../components/ReadReceipt';
import ChatThemePicker from '../components/ChatThemePicker';
import ChatMenus from '../components/ChatMenus';
import { resolveTheme, ChatThemeKey } from '../lib/chatThemes';

export default function ChatThread() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { play } = useSound();
  const [messages, setMessages] = useState<any[]>([]);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sharedPreviews, setSharedPreviews] = useState<Record<string, any>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [actionMessage, setActionMessage] = useState<any>(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showForward, setShowForward] = useState<any>(null);
  const [showReport, setShowReport] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [forwardTargets, setForwardTargets] = useState<any[]>([]);
  const [disappearing, setDisappearing] = useState<number | null>(null);
  const [themeKey, setThemeKey] = useState<ChatThemeKey>('emerald');
  const [voiceCallsEnabled, setVoiceCallsEnabled] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordStartRef = useRef<number>(0);
  const recorder = useVoiceRecorder();

  useReadReceipts(id, userId);
  useDemoAutoReply({ channelId: id, otherUsername: otherUser?.username, messages, myUserId: userId });
  const theme = resolveTheme(themeKey);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const load = async () => {
      const me = await getCachedUser();
      if (!me || !id) { setLoading(false); return; }
      setUserId(me.id);

      const [othersRes, participantRes, msgsRes, settingsRes] = await Promise.all([
        supabase.from('chat_participants').select('user_id').eq('channel_id', id).neq('user_id', me.id).maybeSingle(),
        supabase.from('chat_participants').select('disappearing_seconds, chat_theme').eq('channel_id', id).eq('user_id', me.id).maybeSingle(),
        supabase.from('chat_messages').select('*').eq('channel_id', id).order('created_at', { ascending: true }),
        supabase.from('app_settings').select('value').eq('key', 'voice_calls_enabled').maybeSingle()
      ]);

      if (othersRes.data?.user_id) {
        const { data: p } = await supabase.from('public_profiles').select('id, username').eq('id', othersRes.data.user_id).maybeSingle();
        setOtherUser(p);
      }

      setDisappearing(participantRes.data?.disappearing_seconds ?? null);
      if (participantRes.data?.chat_theme) setThemeKey(participantRes.data.chat_theme as ChatThemeKey);
      setMessages(msgsRes.data || []);
      setVoiceCallsEnabled(settingsRes.data?.value === 'true');
      setLoading(false);

      const sub = supabase
        .channel(`chat_${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${id}` }, (payload: any) => {
          const m = payload.new;
          setMessages(prev => {
            if (prev.some(x => x.id === m.id)) return prev;
            return [...prev, m];
          });
          if (m.sender_id !== me.id) play('message_received');
        })
        .subscribe();

      cleanup = () => { supabase.removeChannel(sub); };
    };

    load();
    return () => { cleanup?.(); };
  }, [id, play]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !userId) return;
    
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      channel_id: id,
      sender_id: userId,
      body: input.trim(),
      message_type: 'text',
      created_at: new Date().toISOString(),
      status: 'sending'
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setInput('');
    play('message_sent');

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ channel_id: id, sender_id: userId, body: optimisticMsg.body, message_type: 'text' })
      .select()
      .single();

    if (data && !error) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...data, status: 'sent' } : m));
    } else {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const startRecording = async () => {
    const ok = await recorder.start();
    if (ok) { setIsRecording(true); recordStartRef.current = Date.now(); }
  };

  const sendRecording = async () => {
    const blob = await recorder.stop();
    setIsRecording(false);
    const duration = Math.round((Date.now() - recordStartRef.current) / 1000);
    if (!blob || !userId || duration < 1) return;

    const localUrl = URL.createObjectURL(blob);
    const tempId = `temp-voice-${Date.now()}`;
    
    const optimisticMsg = {
      id: tempId,
      channel_id: id,
      sender_id: userId,
      body: '🎤 Voice note',
      message_type: 'voice_note',
      voice_note_url: localUrl,
      media_url: localUrl,
      media_duration_seconds: duration,
      created_at: new Date().toISOString(),
      status: 'sending'
    };
    
    setMessages(prev => [...prev, optimisticMsg]);

    const path = `voice-notes/${id}/${Date.now()}.webm`;
    const { error: upErr } = await supabase.storage.from('chat-media').upload(path, blob, { contentType: blob.type });
    
    if (upErr) { 
      console.error("Upload error:", upErr); // Log it to see why it fails
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      return; 
    }
    
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);

    const { data, error } = await supabase.from('chat_messages').insert({
      channel_id: id, sender_id: userId, body: '🎤 Voice note',
      message_type: 'voice_note', voice_note_url: urlData.publicUrl,
      media_url: urlData.publicUrl, media_duration_seconds: duration,
    }).select().single();

    if (data && !error) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...data, status: 'sent' } : m));
    } else {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const cancelRecording = () => { recorder.cancel(); setIsRecording(false); };

  const togglePlay = (m: any) => {
    if (playingId === m.id) { audioRef.current?.pause(); setPlayingId(null); return; }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(m.media_url || m.voice_note_url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(m.id);
  };

  const applyTheme = async (k: ChatThemeKey) => {
    setThemeKey(k);
    if (!id || !userId) return;
    await supabase.from('chat_participants').update({ chat_theme: k }).eq('channel_id', id).eq('user_id', userId);
  };

  const setDisappearingSeconds = async (seconds: number | null) => {
    if (!id) return;
    const { error } = await supabase.rpc('set_chat_disappearing', { p_channel_id: id, p_seconds: seconds });
    if (error) { alert(error.message); return; }
    setDisappearing(seconds);
    setShowChatMenu(false);
  };

  const deleteMsg = async () => {
    if (!actionMessage) return;
    if (!window.confirm('Delete this message?')) return;
    await supabase.from('chat_messages').delete().eq('id', actionMessage.id);
    setMessages(prev => prev.filter(x => x.id !== actionMessage.id));
    setActionMessage(null);
  };

  const openForward = async () => {
    if (!actionMessage) return;
    const me = await getCachedUser();
    if (!me) return;
    const { data: myChannels } = await supabase.from('chat_participants').select('channel_id').eq('user_id', me.id);
    if (!myChannels || myChannels.length === 0) { setShowForward(actionMessage); setActionMessage(null); return; }
    const ids = myChannels.map((c: any) => c.channel_id);
    const { data: others } = await supabase.from('chat_participants').select('channel_id, user_id').in('channel_id', ids).neq('user_id', me.id);
    const otherIds = [...new Set((others || []).map((o: any) => o.user_id))];
    const { data: profiles } = await supabase.from('public_profiles').select('id, username').in('id', otherIds);
    const map: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { map[p.id] = p.username; });
    setForwardTargets((others || []).map((o: any) => ({ channel_id: o.channel_id, username: map[o.user_id] || 'User' })));
    setShowForward(actionMessage);
    setActionMessage(null);
  };

  const doForward = async (channelId: string) => {
    if (!showForward) return;
    const { data, error } = await supabase.rpc('forward_message', { p_message_id: showForward.id, p_target_channel_id: channelId });
    if (error || !data?.ok) { alert(error?.message || data?.error || 'Forward failed'); return; }
    setShowForward(null);
    alert('Forwarded');
  };

  const deleteConversation = async () => {
    if (!id) return;
    if (!window.confirm('Delete this conversation for you? The other person keeps their copy.')) return;
    const { error } = await supabase.rpc('delete_my_chat', { p_channel_id: id });
    if (error) { alert(error.message); return; }
    navigate('/chat');
  };

  const blockUser = async () => {
    if (!otherUser?.id) return;
    if (!window.confirm(`Block @${otherUser.username}?`)) return;
    const { error } = await supabase.rpc('toggle_block', { p_target_id: otherUser.id });
    if (error) { alert(error.message); return; }
    alert(`@${otherUser.username} blocked`);
    setShowChatMenu(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className={`flex flex-col h-[calc(100dvh-120px)] overflow-hidden fixed inset-x-0 top-[57px] bottom-[60px] ${theme.bg} ${theme.bgDark}`}>
      
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-3 py-3 flex items-center gap-2 shrink-0 shadow-md z-20">
        <button onClick={() => navigate('/chat')} className="cursor-pointer"><ArrowLeft size={18} /></button>
        <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center text-xs font-bold">
          {otherUser?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <p className="text-[12px] font-bold">@{otherUser?.username || 'Chat'}</p>
          {disappearing && (
            <p className="text-[9px] opacity-80 flex items-center gap-1">
              <Clock size={9} /> disappears after {disappearing / 3600}h
            </p>
          )}
        </div>
        
        {voiceCallsEnabled && (
          <button onClick={() => alert('Voice calling coming soon')} className="mr-2 cursor-pointer"><Phone size={18} /></button>
        )}

        <button onClick={() => setShowThemePicker(true)} className="mr-2 cursor-pointer"><Palette size={18} /></button>
        <button onClick={() => setShowChatMenu(true)} className="cursor-pointer"><MoreVertical size={18} /></button>
      </header>

      <main className="flex-1 overflow-y-auto p-3 pb-4" style={{ overscrollBehavior: 'contain' }}>
        {messages.length === 0 && (
          <p className="text-center text-[10px] text-gray-400 mt-6">Say hi to @{otherUser?.username}</p>
        )}
        {messages.map(m => {
          const mine = m.sender_id === userId;
          const isVoice = m.message_type === 'voice_note';
          const isShared = m.message_type === 'shared_post';
          const isPending = String(m.id).startsWith('temp-');
          const isFailed = m.status === 'failed';
          
          return (
            <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                onClick={() => !isPending && setActionMessage(m)}
                className={`max-w-[75%] rounded-2xl text-xs ${isPending ? 'opacity-70' : 'cursor-pointer'} ${
                  mine ? `${theme.bubbleMine} chat-bubble-mine` : `${theme.bubbleTheirs} ${theme.bubbleTheirsDark} shadow-sm chat-bubble-theirs`
                } ${isShared ? 'p-1.5' : 'px-3 py-2'}`}
              >
                {m.is_forwarded && (
                  <p className={`text-[9px] italic mb-1 ${mine ? 'text-white/70' : 'text-gray-400'}`}>↪ Forwarded</p>
                )}
                {isVoice ? (
                  <button onClick={(e) => { e.stopPropagation(); togglePlay(m); }} className="flex items-center gap-2 min-w-[140px] cursor-pointer">
                    {playingId === m.id ? <Pause size={14} /> : <Play size={14} />}
                    <div className="flex items-center gap-0.5">
                      {[0,1,2,3,4].map(i => (
                        <span key={i} className="wave-bar w-0.5 h-3 bg-current opacity-80" style={{ animationDelay: `${i * 0.1}s` }} />
                      ))}
                    </div>
                    <span className="text-[10px] opacity-80">{m.media_duration_seconds || m.voice_duration_seconds || 0}s</span>
                    {isPending && <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin ml-1" />}
                  </button>
                ) : isShared ? (
                  <SharedPostCard postId={m.shared_post_id} preview={sharedPreviews[m.shared_post_id] || null} />
                ) : (
                  m.body
                )}
                {mine && !isShared && (
                  <div className="flex justify-end mt-0.5">
                    {isFailed ? (
                      <span className="text-[8px] text-red-300">Failed to send</span>
                    ) : isPending ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse" />
                    ) : (
                      <ReadReceipt delivered={!!m.delivered_at} read={!!m.read_at} />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {isRecording && (
        <div className="bg-red-500 text-white px-3 py-2 flex items-center gap-3 shrink-0">
          <button onClick={cancelRecording} className="cursor-pointer"><Trash2 size={16} /></button>
          <div className="flex-1 flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-xs font-bold">Recording...</span>
          </div>
          <button onClick={sendRecording} className="bg-white text-red-500 rounded-full w-9 h-9 flex items-center justify-center cursor-pointer"><Send size={14} /></button>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        className="bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline p-2 flex gap-2 shrink-0 z-20 relative">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..."
          className="flex-1 p-2.5 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-full text-xs" />
        {input.trim() ? (
          <button type="submit" className="text-white rounded-full w-10 h-10 flex items-center justify-center cursor-pointer" style={{ background: theme.accent }}>
            <Send size={14} />
          </button>
        ) : (
          <button type="button"
            onMouseDown={startRecording} onMouseUp={sendRecording}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); sendRecording(); }}
            className="text-white rounded-full w-10 h-10 flex items-center justify-center cursor-pointer" style={{ background: theme.accent }}>
            <Mic size={14} />
          </button>
        )}
      </form>

      <ChatMenus
        showChatMenu={showChatMenu}
        setShowChatMenu={setShowChatMenu}
        showThemePicker={showThemePicker}
        setShowThemePicker={setShowThemePicker}
        actionMessage={actionMessage}
        setActionMessage={setActionMessage}
        showForward={showForward}
        setShowForward={setShowForward}
        showReport={showReport}
        setShowReport={setShowReport}
        forwardTargets={forwardTargets}
        otherUser={otherUser}
        disappearing={disappearing}
        themeKey={themeKey}
        applyTheme={applyTheme}
        setDisappearingSeconds={setDisappearingSeconds}
        blockUser={blockUser}
        deleteConversation={deleteConversation}
        openForward={openForward}
        deleteMsg={deleteMsg}
        doForward={doForward}
      />
    </div>
  );
    }
