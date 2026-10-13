import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Users, Crown, Megaphone, Copy, Check, Share2,
  UserMinus, Shield, X, LogOut, Send, Mic, Play, Pause, Image as ImageIcon,
  FileText, Trash2, Reply, AtSign, Bell, BellOff, Clock, BarChart3, Flag, Plus
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
  const [showMenu, setShowMenu] = useState(false);

  const [messages, setMessages] = useState<any[]>([]);
  const [polls, setPolls] = useState<Record<string, any>>({});
  const [input, setInput] = useState('');
  const [me, setMe] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [mentions, setMentions] = useState<any[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [actionMessage, setActionMessage] = useState<any>(null);
  const [showPoll, setShowPoll] = useState(false);
  const [reportMessage, setReportMessage] = useState<any>(null);

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
    await supabase.rpc('purge_expired_group_messages');
    const { data: res } = await supabase.rpc('list_group_messages', { p_group_id: id, p_limit: 100 });
    if (res?.ok) setMessages(res.messages || []);
  };

  const loadPoll = async (messageId: string) => {
    const { data: res } = await supabase.rpc('get_group_poll', { p_message_id: messageId });
    if (res?.ok) setPolls(prev => ({ ...prev, [messageId]: res }));
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
    // Load polls for any poll messages
    messages.forEach(m => {
      if (m.message_type === 'poll' && !polls[m.id]) loadPoll(m.id);
    });
  }, [messages]);

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
        setMessages(prev => [...prev, { ...m, sender_username: user?.username, sender_avatar: user?.avatar_url }]);
        if (m.message_type === 'poll') loadPoll(m.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

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
      try { await navigator.share({ title: data.group.name, text: `Join ${data.group.name}`, url }); } catch {}
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

  const mute = async (minutes: number | null) => {
    const { data: res, error } = await supabase.rpc('set_group_mute', {
      p_group_id: id, p_duration_minutes: minutes,
    });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else { setShowMenu(false); loadGroup(); }
  };

  const setDisappearing = async (seconds: number | null) => {
    const { data: res, error } = await supabase.rpc('set_group_disappearing', {
      p_group_id: id, p_seconds: seconds,
    });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else { setShowMenu(false); loadGroup(); loadMessages(); }
  };

  const setPostingRule = async (who: 'everyone' | 'admins') => {
    const { data: res, error } = await supabase.rpc('set_group_posting_rule', {
      p_group_id: id, p_who_can_post: who,
    });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else { setShowMenu(false); loadGroup(); }
  };

  const sendText = async () => {
    if (!input.trim() || !id) return;
    const body = input.trim();
    const mentionIds = mentions.map(m => m.user_id);
    setInput(''); setReplyTo(null); setMentions([]); setSending(true);
    const { error } = await supabase.rpc('send_group_message', {
      p_group_id: id, p_body: body, p_message_type: 'text',
      p_reply_to_id: replyTo?.id || null, p_mentions: mentionIds,
    });
    if (error) alert(error.message);
    setSending(false);
  };

  const sendImage = async (file: File) => {
    if (!id) return;
    const compressed = await compressImage(file);
    const ext = compressed.name.split('.').pop();
    const path = `group-media/${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('chat-media').upload(path, compressed);
    if (upErr) { alert(upErr.message); return; }
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    await supabase.rpc('send_group_message', {
      p_group_id: id, p_message_type: 'image',
      p_media_url: urlData.publicUrl, p_reply_to_id: replyTo?.id || null,
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
      p_group_id: id, p_message_type: 'document', p_media_url: urlData.publicUrl,
    });
  };

  const startRecording = async () => {
    const ok = await recorder.start();
    if (ok) setIsRecording(true);
  };

  const sendRecording = async () => {
    const blob = await recorder.stop();
    setIsRecording(false);
    const duration = Math.round((Date.now() - recordStartRef.current) / 1000);
    if (!blob || !id || duration < 1) return;
    const path = `group-voice/${id}/${Date.now()}.webm`;
    const { error: upErr } = await supabase.storage.from('chat-media').upload(path, blob, { contentType: blob.type });
    if (upErr) { alert(upErr.message); return; }
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    await supabase.rpc('send_group_message', {
      p_group_id: id, p_message_type: 'voice_note',
      p_media_url: urlData.publicUrl, p_media_duration_seconds: duration,
    });
  };

  const cancelRecording = () => { recorder.cancel(); setIsRecording(false); };

  const togglePlay = (m: any) => {
    if (playingId === m.id) { audioRef.current?.pause(); setPlayingId(null); return; }
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
    const { error } = await supabase.rpc('delete_group_message', { p_message_id: actionMessage.id });
    if (error) alert(error.message);
    else setMessages(prev => prev.map(x => x.id === actionMessage.id ? { ...x, is_deleted: true, body: null, media_url: null } : x));
    setActionMessage(null);
  };

  const submitReport = async (reason: string) => {
    if (!reportMessage) return;
    const { data: res, error } = await supabase.rpc('report_group_message', {
      p_message_id: reportMessage.id, p_reason: reason,
    });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else alert('Reported. Support will review.');
    setReportMessage(null);
  };

  const vote = async (pollId: string, messageId: string, key: string) => {
    const { error } = await supabase.rpc('vote_on_poll', { p_poll_id: pollId, p_option_key: key });
    if (error) alert(error.message);
    else loadPoll(messageId);
  };

  const handleInputChange = async (val: string) => {
    setInput(val);
    const atIdx = val.lastIndexOf('@');
    if (atIdx >= 0 && !val.slice(atIdx + 1).includes(' ')) {
      setShowMentions(true);
      const { data: res } = await supabase.rpc('search_group_members', {
        p_group_id: id, p_query: val.slice(atIdx + 1),
      });
      setMentionResults(res?.members || []);
    } else setShowMentions(false);
  };

  const pickMention = (m: any) => {
    const atIdx = input.lastIndexOf('@');
    setInput(`${input.slice(0, atIdx)}@${m.username} `);
    setMentions(prev => [...prev, m]);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!data?.ok) return <div className="p-4 text-center text-xs">Group not found.</div>;

  const g = data.group;
  const myRole = data.my_role;
  const isStaff = myRole === 'owner' || myRole === 'admin';
  const isMuted = data.my_muted_until && new Date(data.my_muted_until) > new Date();
  const canPost = !g.is_announcement && g.who_can_post === 'everyone' || isStaff;

  return (
    <div className="pb-24">
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-20 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline">
        <button onClick={() => navigate('/groups')} className="text-navy dark:text-white"><ArrowLeft size={20} /></button>
        <p className="flex-1 text-[13px] font-bold text-navy dark:text-white truncate">{g.name}</p>
        {isMuted && <BellOff size={14} className="text-gray-400" />}
        <button onClick={() => setShowMenu(true)} className="text-navy dark:text-white text-[18px]">⋯</button>
      </div>

      {/* Hero */}
      <div className="p-4 flex flex-col items-center border-b border-gray-100 dark:border-darkline">
        <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-xl overflow-hidden mb-2">
          {g.avatar_url ? <img src={g.avatar_url} alt="" className="w-16 h-16 object-cover" /> : g.name?.[0]?.toUpperCase()}
        </div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-[15px] font-black text-navy dark:text-white">{g.name}</h1>
          {g.is_announcement && <Megaphone size={13} className="text-accent" />}
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {g.member_count} members
          {g.disappearing_seconds ? ` · auto-deletes after ${g.disappearing_seconds / 3600}h` : ''}
        </p>
        {isStaff && g.invite_code && (
          <div className="flex gap-2 mt-2">
            <button onClick={copyCode} className="text-[10px] font-bold text-navy dark:text-white bg-gray-100 dark:bg-darkline px-3 py-1.5 rounded-full flex items-center gap-1">
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
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
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[11px] font-bold capitalize ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-gray-500'}`}>
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
              const isPoll = m.message_type === 'poll';
              const isSystem = m.message_type === 'system';
              const canDelete = !m.is_deleted && (mine || isStaff);

              if (isSystem) {
                return <p key={m.id} className="text-center text-[10px] italic text-gray-400 my-2">{m.body}</p>;
              }

              if (m.is_deleted) {
                return (
                  <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <p className="text-[10px] italic text-gray-400 px-3 py-1">Message deleted</p>
                  </div>
                );
              }

              const poll = polls[m.id];

              return (
                <div key={m.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    onClick={() => { if (!isImage && !isVoice && !isPoll) setActionMessage(m); }}
                    className={`max-w-[80%] rounded-2xl ${
                      mine ? 'bg-navy text-white rounded-br-sm' : 'bg-white dark:bg-darkcard text-gray-800 dark:text-gray-100 shadow-sm rounded-bl-sm'
                    } overflow-hidden`}>
                    {!mine && <p className="text-[10px] font-bold px-3 pt-1.5 text-accent">@{m.sender_username}</p>}

                    {m.reply_preview && (
                      <div className={`mx-2 mt-1.5 px-2 py-1 rounded border-l-2 text-[10px] ${mine ? 'bg-white/10 border-white/40' : 'bg-gray-100 dark:bg-darkbg border-accent text-gray-500'}`}>
                        <p className="font-bold">@{m.reply_sender}</p>
                        <p className="truncate">{m.reply_preview}</p>
                      </div>
                    )}

                    {isImage && <img src={m.media_url} alt="" className="max-w-[280px] w-full" />}

                    {isVoice && (
                      <button onClick={() => togglePlay(m)} className="flex items-center gap-2 px-3 py-2 min-w-[160px]">
                        {playingId === m.id ? <Pause size={14} /> : <Play size={14} />}
                        <div className="flex items-center gap-0.5">
                          {[0,1,2,3,4].map(i => <span key={i} className="wave-bar w-0.5 h-3 bg-current opacity-80" style={{ animationDelay: `${i * 0.1}s` }} />)}
                        </div>
                        <span className="text-[10px] opacity-80">{m.media_duration_seconds || 0}s</span>
                      </button>
                    )}

                    {isDoc && <div className="p-2"><DocumentCard url={m.media_url} /></div>}

                    {isPoll && poll && (
                      <div className="p-3 min-w-[220px]">
                        <p className="text-[12px] font-bold mb-2 flex items-center gap-1"><BarChart3 size={12} /> {poll.poll.question}</p>
                        {poll.results.map((r: any) => {
                          const voted = poll.my_votes.includes(r.option_key);
                          const pct = poll.total_votes > 0 ? Math.round((r.votes / poll.total_votes) * 100) : 0;
                          return (
                            <button
                              key={r.option_key}
                              disabled={poll.poll.is_closed}
                              onClick={() => vote(poll.poll.id, m.id, r.option_key)}
                              className={`w-full relative mb-1.5 rounded-lg overflow-hidden border text-left ${voted ? 'border-accent' : 'border-gray-200 dark:border-darkline'}`}
                            >
                              <div className="absolute inset-0 bg-accent/20" style={{ width: `${pct}%` }} />
                              <div className="relative flex justify-between p-2 text-[11px]">
                                <span className="font-bold">{voted ? '✓ ' : ''}{r.text}</span>
                                <span>{pct}%</span>
                              </div>
                            </button>
                          );
                        })}
                        <p className="text-[9px] opacity-70 mt-1">{poll.total_votes} votes{poll.poll.is_closed ? ' · closed' : ''}</p>
                      </div>
                    )}

                    {m.body && !isPoll && <p className="px-3 py-2 text-[12px] whitespace-pre-wrap">{m.body}</p>}

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
                {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-10 h-10 object-cover" /> : m.username?.[0]?.toUpperCase()}
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
                <button onCl
