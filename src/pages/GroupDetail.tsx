import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Users, Crown, Megaphone, Copy, Check, Share2,
  UserMinus, Shield, X, LogOut, Send, Mic, Play, Pause, Image as ImageIcon,
  FileText, Trash2, Reply, AtSign
} from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { compressImage } from '../utils/compressImage';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import DocumentCard from '../components/DocumentCard';

type Tab = 'chat' | 'members' | 'info';

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('chat');
  const [copied, setCopied] = useState(false);
  const [memberAction, setMemberAction] = useState<any>(null);

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [me, setMe] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [mentions, setMentions] = useState<any[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [actionMessage, setActionMessage] = useState<any>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recordStartRef = useRef<number>(0);
  const recorder = useVoiceRecorder();

  const loadGroup = async () => {
    if (!id) return;
    const { data: res } = await supabase.rpc('get_group', { p_group_id: id });
    if (res?.ok) setData(res);
    setLoading(false);
  };

  const loadMessages = async () => {
    if (!id) return;
    const { data: res } = await supabase.rpc('list_group_messages', {
      p_group_id: id, p_limit: 100,
    });
    if (res?.ok) setMessages(res.messages || []);
  };

  useEffect(() => {
    const init = async () => {
      const u = await getCachedUser();
      setMe(u);
      await loadGroup();
      await loadMessages();
    };
    init();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const sub = supabase
      .channel(`group_${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_messages',
        filter: `group_id=eq.${id}`,
      }, async (payload: any) => {
        const m = payload.new;
        const { data: user } = await supabase
          .from('public_profiles')
          .select('username, avatar_url')
          .eq('id', m.sender_id)
          .maybeSingle();
        setMessages(prev => [...prev, {
          ...m,
          sender_username: user?.username,
          sender_avatar: user?.avatar_url,
        }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const copyCode = async () => {
    if (!data?.group?.invite_code) return;
    await navigator.clipboard.writeText(data.group.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareCode = async () => {
    if (!data?.group?.invite_code) return;
    const url = `https://cenpaya.pages.dev/groups/join/${data.group.invite_code}`;
    if (navigator.share) {
      try { await navigator.share({ title: data.group.name, text: `Join ${data.group.name} on CenPaya`, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied');
    }
  };

  const leave = async () => {
    if (!window.confirm('Leave this group?')) return;
    const { data: res, error } = await supabase.rpc('leave_group', { p_group_id: id });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else navigate('/groups');
  };

  const sendText = async () => {
    if (!input.trim() || !id) return;
    const body = input.trim();
    const mentionIds = mentions.map(m => m.user_id);
    setInput('');
    setReplyTo(null);
    setMentions([]);
    setSending(true);
    const { data: res, error } = await supabase.rpc('send_group_message', {
      p_group_id: id,
      p_body: body,
      p_message_type: 'text',
      p_reply_to_id: replyTo?.id || null,
      p_mentions: mentionIds,
    });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Send failed');
    setSending(false);
  };

  const sendImage = async (file: File) => {
    if (!id || !me) return;
    const compressed = await compressImage(file);
    const ext = compressed.name.split('.').pop();
    const path = `group-media/${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('chat-media').upload(path, compressed);
    if (upErr) { alert(upErr.message); return; }
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    await supabase.rpc('send_group_message', {
      p_group_id: id,
      p_message_type: 'image',
      p_media_url: urlData.publicUrl,
      p_reply_to_id: replyTo?.id || null,
    });
  };

  const sendDoc = async (file: File) => {
    if (!id) return;
    const ext = file.name.split('.').pop();
    const path = `group-docs/${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('listings').upload(path, file);
    if (upErr) { alert(upErr.message); return; }
    const { data: urlData } = supabase.storage.from('listings').getPublicUrl(path);
    await supabase.rpc('send_group_message', {
      p_group_id: id,
      p_message_type: 'document',
      p_media_url: urlData.publicUrl,
    });
  };

  const startRecording = async () => {
    const ok = await recorder.start();
    if (ok) {
      setIsRecording(true);
      recordStartRef.current = Date.now();
    }
  };

  const sendRecording = async () => {
    const blob = await recorder.stop();
    setIsRecording(false);
    const duration = Math.round((Date.now() - recordStartRef.current) / 1000);
    setRecordingSeconds(0);
    if (!blob || !id || duration < 1) return;

    const path = `group-voice/${id}/${Date.now()}.webm`;
    const { error: upErr } = await supabase.storage
      .from('chat-media')
      .upload(path, blob, { contentType: blob.type });
    if (upErr) { alert(upErr.message); return; }
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);

    await supabase.rpc('send_group_message', {
      p_group_id: id,
      p_message_type: 'voice_note',
      p_media_url: urlData.publicUrl,
      p_media_duration_seconds: duration,
    });
  };

  const cancelRecording = () => {
    recorder.cancel();
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const togglePlay = (m: any) => {
    if (playingId === m.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(m.media_url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(m.id);
  };

  const deleteMsg = async () => {
    if (!actionMessage) return;
    if (!window.confirm('Delete this message?')) return;
    const { data: res, error } = await supabase.rpc('delete_group_message', { p_message_id: actionMessage.id });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else {
      setMessages(prev => prev.map(x => x.id === actionMessage.id ? { ...x, is_deleted: true, body: null, media_url: null } : x));
    }
    setActionMessage(null);
  };

  const handleInputChange = async (val: string) => {
    setInput(val);
    const atIdx = val.lastIndexOf('@');
    if (atIdx >= 0 && atIdx === val.length - 1 || (atIdx >= 0 && !val.slice(atIdx + 1).includes(' '))) {
      setMentionQuery(val.slice(atIdx + 1));
      setShowMentions(true);
      const { data: res } = await supabase.rpc('search_group_members', {
        p_group_id: id, p_query: val.slice(atIdx + 1),
      });
      setMentionResults(res?.members || []);
    } else {
      setShowMentions(false);
    }
  };

  const pickMention = (m: any) => {
    const atIdx = input.lastIndexOf('@');
    const before = input.slice(0, atIdx);
    setInput(`${before}@${m.username} `);
    setMentions(prev => [...prev, m]);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!data?.ok) return <div className="p-4 text-center text-xs">Group not found.</div>;

  const g = data.group;
  const myRole = data.my_role;
  const isStaff = myRole === 'owner' || myRole === 'admin';
  const canPost = !g.is_announcement || isStaff;

  return (
    <div className="pb-24">
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-20 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline">
        <button onClick={() => navigate('/groups')} className="text-navy dark:text-white"><ArrowLeft size={20} /></button>
        <p className="flex-1 text-[13px] font-bold text-navy dark:text-white truncate">{g.name}</p>
        <p className="text-[10px] text-gray-500">{g.member_count} members</p>
      </div>

      {/* Hero */}
      <div className="p-4 flex flex-col items-center border-b border-gray-100 dark:border-darkline">
        <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-xl overflow-hidden mb-2">
          {g.avatar_url ? (
            <img src={g.avatar_url} alt="" className="w-16 h-16 object-cover" />
          ) : (
            g.name?.[0]?.toUpperCase()
          )}
        </div>
        <div className="flex items-center gap-1.5 mb-1">
          <h1 className="text-[15px] font-black text-navy dark:text-white">{g.name}</h1>
          {g.is_announcement && <Megaphone size={13} className="text-accent" />}
        </div>
        {isStaff && g.invite_code && (
          <div className="flex gap-2 mt-2">
            <button onClick={copyCode} className="text-[10px] font-bold text-navy dark:text-white bg-gray-100 dark:bg-darkline px-3 py-1.5 rounded-full flex items-center gap-1">
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy code</>}
            </button>
            <button onClick={shareCode} className="text-[10px] font-bold text-white bg-accent px-3 py-1.5 rounded-full flex items-center gap-1">
              <Share2 size={11} /> Share
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-darkline sticky top-[50px] z-10 bg-white dark:bg-darkcard">
        {(['chat','members','info'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[11px] font-bold capitalize ${
              tab === t ? 'text-accent border-b-2 border-accent' : 'text-gray-500'
            }`}
          >
            {t}{t === 'members' ? ` (${data.members?.length || 0})` : ''}
          </button>
        ))}
      </div>

      {/* Chat */}
      {tab === 'chat' && (
        <div className="pb-32">
          <div className="px-3 py-3">
            {messages.map(m => {
              const mine = m.sender_id === me?.id;
              const isVoice = m.message_type === 'voice_note';
              const isImage = m.message_type === 'image';
              const isDoc = m.message_type === 'document';
              const canDelete = !m.is_deleted && (mine || isStaff);

              if (m.is_deleted) {
                return (
                  <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <p className="text-[10px] italic text-gray-400 px-3 py-1">Message deleted</p>
                  </div>
                );
              }

              return (
                <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    onContextMenu={(e) => { e.preventDefault(); if (canDelete) setActionMessage(m); }}
                    onClick={() => { if (canDelete && !isImage && !isVoice) setActionMessage(m); }}
                    className={`max-w-[80%] rounded-2xl ${
                      mine
                        ? 'bg-navy text-white rounded-br-sm'
                        : 'bg-white dark:bg-darkcard text-gray-800 dark:text-gray-100 shadow-sm rounded-bl-sm'
                    } overflow-hidden`}
                  >
                    {!mine && (
                      <p className="text-[10px] font-bold px-3 pt-1.5 text-accent">
                        @{m.sender_username}
                      </p>
                    )}
                    {m.reply_preview && (
                      <div className={`mx-2 mt-1.5 px-2 py-1 rounded border-l-2 text-[10px] ${
                        mine ? 'bg-white/10 border-white/40 text-white/80' : 'bg-gray-100 dark:bg-darkbg border-accent text-gray-500'
                      }`}>
                        <p className="font-bold">@{m.reply_sender}</p>
                        <p className="truncate">{m.reply_preview}</p>
                      </div>
                    )}

                    {isImage && (
                      <img src={m.media_url} alt="" className="max-w-[280px] w-full" />
                    )}

                    {isVoice && (
                      <button onClick={() => togglePlay(m)} className="flex items-center gap-2 px-3 py-2 min-w-[160px]">
                        {playingId === m.id ? <Pause size={14} /> : <Play size={14} />}
                        <div className="flex items-center gap-0.5">
                          {[0,1,2,3,4].map(i => (
                            <span key={i} className="wave-bar w-0.5 h-3 bg-current opacity-80" style={{ animationDelay: `${i * 0.1}s` }} />
                          ))}
                        </div>
                        <span className="text-[10px] opacity-80">{m.media_duration_seconds || 0}s</span>
                      </button>
                    )}

                    {isDoc && (
                      <div className="p-2">
                        <DocumentCard url={m.media_url} />
                      </div>
                    )}

                    {m.body && (
                      <p className="px-3 py-2 text-[12px] whitespace-pre-wrap">{m.body}</p>
                    )}

                    <p className={`text-[8px] px-3 pb-1.5 ${mine ? 'text-white/60' : 'text-gray-400'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* Members */}
      {tab === 'members' && (
        <div className="px-3 py-3">
          {data.members?.map((m: any) => (
            <div key={m.user_id} className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold overflow-hidden">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="w-10 h-10 object-cover" />
                ) : (
                  m.username?.[0]?.toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[12px] font-bold text-navy dark:text-white truncate">@{m.username}</p>
                  {m.role === 'owner' && <Crown size={11} className="text-gold" />}
                  {m.role === 'admin' && <Crown size={11} className="text-accent" />}
                </div>
                <p className="text-[9px] text-gray-400 uppercase tracking-wider">{m.role}</p>
              </div>
              {isStaff && m.role !== 'owner' && m.user_id !== me?.id && (
                <button onClick={() => setMemberAction(m)} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-darkline flex items-center justify-center text-gray-500">
                  <Shield size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      {tab === 'info' && (
        <div className="px-3 py-3">
          <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm p-4 mb-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Description</p>
            <p className="text-[12px] text-navy dark:text-white">{g.description || 'No description'}</p>
          </div>
          <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm p-4 mb-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Created</p>
            <p className="text-[12px] text-navy dark:text-white">{new Date(g.created_at).toLocaleDateString()}</p>
          </div>
          {myRole !== 'owner' && (
            <button onClick={leave} className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-1">
              <LogOut size={13} /> Leave group
            </button>
          )}
        </div>
      )}

      {/* Input bar — chat tab only */}
      {tab === 'chat' && canPost && (
        <>
          {replyTo && (
            <div className="fixed bottom-24 left-0 right-0 bg-navy/95 text-white px-3 py-2 flex items-center gap-2 z-20">
              <Reply size={14} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold">Replying to @{replyTo.sender_username}</p>
                <p className="text-[10px] truncate opacity-80">{replyTo.body || '📎 media'}</p>
              </div>
              <button onClick={() => setReplyTo(null)}><X size={16} /></button>
            </div>
          )}

          {showMentions && mentionResults.length > 0 && (
            <div className="fixed bottom-32 left-2 right-2 max-h-40 overflow-y-auto bg-white dark:bg-darkcard rounded-xl shadow-lg z-30">
              {mentionResults.map((m: any) => (
                <button
                  key={m.user_id}
                  onClick={() => pickMention(m)}
                  className="w-full flex items-center gap-2 p-2 border-b border-gray-100 dark:border-darkline last:border-b-0 text-left"
                >
                  <AtSign size={12} className="text-accent" />
                  <span className="text-[12px] font-bold text-navy dark:text-white">@{m.username}</span>
                </button>
              ))}
            </div>
          )}

          {isRecording && (
            <div className="fixed bottom-24 left-0 right-0 bg-red-500 text-white px-3 py-2 flex items-center gap-3 z-20">
              <button onClick={cancelRecording}><Trash2 size={16} /></button>
              <div className="flex-1 flex items-center gap-2">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-xs font-bold">Recording...</span>
              </div>
              <button onClick={sendRecording} className="bg-white text-red-500 rounded-full w-9 h-9 flex items-center justify-center">
                <Send siz
