import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Send, Mic, Play, Pause, Trash2, MoreVertical, X,
  Forward, Clock, Flag, Ban, Check
} from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import SharedPostCard from '../components/SharedPostCard';
import ReportSheet from '../components/ReportSheet';

export default function ChatThread() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [forwardTargets, setForwardTargets] = useState<any[]>([]);
  const [disappearing, setDisappearing] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordStartRef = useRef<number>(0);
  const recorder = useVoiceRecorder();

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const load = async () => {
      const me = await getCachedUser();
      if (!me || !id) { setLoading(false); return; }
      setUserId(me.id);

      await supabase.rpc('purge_expired_chat_messages');

      const { data: others } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('channel_id', id)
        .neq('user_id', me.id)
        .maybeSingle();

      if (others?.user_id) {
        const { data: p } = await supabase
          .from('public_profiles')
          .select('id, username')
          .eq('id', others.user_id)
          .maybeSingle();
        setOtherUser(p);
      }

      const { data: myParticipant } = await supabase
        .from('chat_participants')
        .select('disappearing_seconds')
        .eq('channel_id', id)
        .eq('user_id', me.id)
        .maybeSingle();
      setDisappearing(myParticipant?.disappearing_seconds ?? null);

      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', id)
        .order('created_at', { ascending: true });
      setMessages(msgs || []);

      const sharedIds = (msgs || []).filter((m: any) => m.message_type === 'shared_post' && m.shared_post_id).map((m: any) => m.shared_post_id);
      if (sharedIds.length > 0) {
        const { data: posts } = await supabase.from('posts').select('id, content, image_url, user_id, created_at').in('id', sharedIds);
        const userIds = [...new Set((posts || []).map((p: any) => p.user_id))];
        const { data: authors } = await supabase.from('public_profiles').select('id, username').in('id', userIds);
        const authorMap: Record<string, string> = {};
        (authors || []).forEach((a: any) => { authorMap[a.id] = a.username; });
        const previewMap: Record<string, any> = {};
        (posts || []).forEach((p: any) => { previewMap[p.id] = { ...p, username: authorMap[p.user_id] || 'User' }; });
        setSharedPreviews(previewMap);
      }

      setLoading(false);

      const sub = supabase
        .channel(`chat_${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${id}` },
          async (payload: any) => {
            const m = payload.new;
            setMessages(prev => [...prev, m]);
            if (m.message_type === 'shared_post' && m.shared_post_id && !sharedPreviews[m.shared_post_id]) {
              const { data: post } = await supabase.from('posts').select('id, content, image_url, user_id, created_at').eq('id', m.shared_post_id).maybeSingle();
              if (post) {
                const { data: author } = await supabase.from('public_profiles').select('username').eq('id', post.user_id).maybeSingle();
                setSharedPreviews(prev => ({ ...prev, [post.id]: { ...post, username: author?.username || 'User' } }));
              }
            }
          })
        .subscribe();

      cleanup = () => { supabase.removeChannel(sub); };
    };

    load();
    return () => { cleanup?.(); };
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !userId) return;
    const body = input.trim();
    setInput('');
    await supabase.from('chat_messages').insert({ channel_id: id, sender_id: userId, body, message_type: 'text' });
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

    const path = `voice-notes/${id}/${Date.now()}.webm`;
    const { error: upErr } = await supabase.storage.from('chat-media').upload(path, blob, { contentType: blob.type });
    if (upErr) { alert('Upload failed: ' + upErr.message); return; }
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);

    await supabase.from('chat_messages').insert({
      channel_id: id, sender_id: userId, body: '🎤 Voice note',
      message_type: 'voice_note', voice_note_url: urlData.publicUrl,
      media_url: urlData.publicUrl, media_duration_seconds: duration,
    });
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

  const setDisappearingSeconds = async (seconds: number | null) => {
    if (!id) return;
    const { error } = await supabase.rpc('set_chat_disappearing', { p_channel_id: id, p_seconds: seconds });
    if (error) { alert(error.message); return; }
    setDisappearing(seconds);
    setShowChatMenu(false);
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
    <div className="flex flex-col h-screen bg-offwhite dark:bg-darkbg">
      <header className="bg-gradient-to-r from-brand to-brand-dark text-white px-3 py-3 flex items-center gap-2 sticky top-0 z-10">
        <button onClick={() => navigate('/chat')}><ArrowLeft size={18} /></button>
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
        <button onClick={() => setShowChatMenu(true)}><MoreVertical size={18} /></button>
      </header>

      <main className="flex-1 overflow-y-auto p-3 pb-24">
        {messages.length === 0 && (
          <p className="text-center text-[10px] text-gray-400 mt-6">Say hi to @{otherUser?.username}</p>
        )}
        {messages.map(m => {
          const mine = m.sender_id === userId;
          const isVoice = m.message_type === 'voice_note';
          const isShared = m.message_type === 'shared_post';
          return (
            <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                onClick={() => setActionMessage(m)}
                className={`max-w-[75%] rounded-2xl text-xs ${
                  mine ? 'bg-navy text-white rounded-br-sm' : 'bg-white dark:bg-darkcard text-gray-800 dark:text-gray-100 shadow-sm rounded-bl-sm'
                } ${isShared ? 'p-1.5' : 'px-3 py-2'}`}
              >
                {m.is_forwarded && (
                  <p className={`text-[9px] italic mb-1 ${mine ? 'text-white/70' : 'text-gray-400'}`}>↪ Forwarded</p>
                )}
                {isVoice ? (
                  <button onClick={(e) => { e.stopPropagation(); togglePlay(m); }} className="flex items-center gap-2 min-w-[140px]">
                    {playingId === m.id ? <Pause size={14} /> : <Play size={14} />}
                    <div className="flex items-center gap-0.5">
                      {[0,1,2,3,4].map(i => (
                        <span key={i} className="wave-bar w-0.5 h-3 bg-current opacity-80" style={{ animationDelay: `${i * 0.1}s` }} />
                      ))}
                    </div>
                    <span className="text-[10px] opacity-80">{m.media_duration_seconds || m.voice_duration_seconds || 0}s</span>
                  </button>
                ) : isShared ? (
                  <SharedPostCard postId={m.shared_post_id} preview={sharedPreviews[m.shared_post_id] || null} />
                ) : (
                  m.body
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {isRecording && (
        <div className="fixed bottom-16 left-0 right-0 bg-red-500 text-white px-3 py-2 flex items-center gap-3 z-20">
          <button onClick={cancelRecording}><Trash2 size={16} /></button>
          <div className="flex-1 flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-xs font-bold">Recording...</span>
          </div>
          <button onClick={sendRecording} className="bg-white text-red-500 rounded-full w-9 h-9 flex items-center justify-center"><Send size={14} /></button>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        className="fixed bottom-16 left-0 right-0 bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline p-2 flex gap-2 z-10">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..."
          className="flex-1 p-2.5 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-full text-xs" />
        {input.trim() ? (
          <button type="submit" className="bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center"><Send size={14} /></button>
        ) : (
          <button type="button" onMouseDown={startRecording} onMouseUp={sendRecording}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); sendRecording(); }}
            className="bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center"><Mic size={14} /></button>
        )}
      </form>

      {/* Chat menu */}
      {showChatMenu && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={() => setShowChatMenu(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy dark:text-white">Chat options</p>
              <button onClick={() => setShowChatMenu(false)}><X size={18} /></button>
            </div>
            <div className="p-3 space-y-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Disappearing messages</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {[
                  { v: 86400, l: '24 hours' },
                  { v: 604800, l: '7 days' },
                  { v: 7776000, l: '90 days' },
                  { v: null, l: 'Off' },
                ].map(({ v, l }) => (
                  <button key={l} onClick={() => setDisappearingSeconds(v)}
                    className={`p-2.5 rounded-lg text-[11px] font-bold flex items-center gap-2 ${disappearing === v ? 'bg-accent/15 text-accent' : 'bg-gray-50 dark:bg-darkbg'}`}>
                    <Clock size={12} /> {l}
                  </button>
                ))}
              </div>

              <button onClick={blockUser} className="w-full text-left p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-[12px] flex items-center gap-2">
                <Ban size={14} /> Block @{otherUser?.username}
              </button>
              <button onClick={() => { setShowChatMenu(false); setShowReport(true); }} className="w-full text-left p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 font-bold text-[12px] flex items-center gap-2">
                <Flag size={14} /> Report user
              </button>
              <button onClick={deleteConversation} className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2">
                <Trash2 size={14} /> Delete conversation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message actions */}
      {actionMessage && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={() => setActionMessage(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy dark:text-white">Message</p>
              <button onClick={() => setActionMessage(null)}><X size={18} /></button>
            </div>
            <div className="p-3 space-y-2">
              <button onClick={openForward} className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2">
                <Forward size={14} /> Forward
              </button>
              <button onClick={deleteMsg} className="w-full text-left p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-[12px] flex items-center gap-2">
                <Trash2 size={14} /> Delete message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward picker */}
      {showForward && (
        <div className="fixed inset-0 z-[210] bg-black/50 flex items-end" onClick={() => setShowForward(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[70vh] overflow-y-auto animate-slide-up">
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy dark:text-white">Forward to...</p>
              <button onClick={() => setShowForward(null)}><X size={18} /></button>
            </div>
            {forwardTargets.length === 0 && (
              <p className="p-6 text-center text-[10px] text-gray-500">No other chats to forward to.</p>
            )}
            {forwardTargets.map(t => (
              <button key={t.channel_id} onClick={() => doForward(t.channel_id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-darkline last:border-b-0">
                <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold">
                  {t.username?.[0]?.toUpperCase()}
                </div>
                <span className="flex-1 text-left text-[12px] font-bold text-navy dark:text-white">@{t.username}</span>
                <Check size={14} className="text-gray-300" />
              </button>
            ))}
          </div>
        </div>
      )}

      {showReport && otherUser && (
        <ReportSheet
          targetType="user"
          targetId={otherUser.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
            }
