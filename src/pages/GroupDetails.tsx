import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { compressImage } from '../utils/compressImage';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import GroupDetailView from './GroupDetailView';

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'chat' | 'members' | 'info'>('chat');
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
    if (res?.ok) setPolls((prev) => ({ ...prev, [messageId]: res }));
  };

  useEffect(() => {
    (async () => {
      const u = await getCachedUser();
      setMe(u);
      await loadGroup();
      await loadMessages();
    })();
  }, [id]);

  useEffect(() => {
    messages.forEach((m) => {
      if (m.message_type === 'poll' && !polls[m.id]) loadPoll(m.id);
    });
  }, [messages]);

  useEffect(() => {
    if (!id) return;
    const sub = supabase
      .channel(`group_${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${id}` },
        async (payload: any) => {
          const m = payload.new;
          const { data: user } = await supabase.from('public_profiles').select('username, avatar_url').eq('id', m.sender_id).maybeSingle();
          setMessages((prev) => [...prev, { ...m, sender_username: user?.username, sender_avatar: user?.avatar_url }]);
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
    const { data: res, error } = await supabase.rpc('set_group_mute', { p_group_id: id, p_duration_minutes: minutes });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else { setShowMenu(false); loadGroup(); }
  };

  const setDisappearing = async (seconds: number | null) => {
    const { data: res, error } = await supabase.rpc('set_group_disappearing', { p_group_id: id, p_seconds: seconds });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else { setShowMenu(false); loadGroup(); loadMessages(); }
  };

  const setPostingRule = async (who: 'everyone' | 'admins') => {
    const { data: res, error } = await supabase.rpc('set_group_posting_rule', { p_group_id: id, p_who_can_post: who });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else { setShowMenu(false); loadGroup(); }
  };

  const shareGroupToFeed = async () => {
    const { data: res, error } = await supabase.rpc('share_group_to_social', { p_group_id: id });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else { alert('Group shared to feed'); setShowMenu(false); }
  };

  const sendText = async () => {
    if (!input.trim() || !id) return;
    const body = input.trim();
    const mentionIds = mentions.map((m) => m.user_id);
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
    await supabase.rpc('send_group_message', { p_group_id: id, p_message_type: 'image', p_media_url: urlData.publicUrl, p_reply_to_id: replyTo?.id || null });
  };

  const startRecording = async () => {
    const ok = await recorder.start();
    if (ok) { setIsRecording(true); recordStartRef.current = Date.now(); }
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
    await supabase.rpc('send_group_message', { p_group_id: id, p_message_type: 'voice_note', p_media_url: urlData.publicUrl, p_media_duration_seconds: duration });
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
    else setMessages((prev) => prev.map((x) => (x.id === actionMessage.id ? { ...x, is_deleted: true, body: null, media_url: null } : x)));
    setActionMessage(null);
  };

  const shareMessageToFeed = async () => {
    if (!actionMessage) return;
    const { data: res, error } = await supabase.rpc('share_group_message_to_social', { p_message_id: actionMessage.id, p_caption: '' });
    if (error || !res?.ok) alert(error?.message || res?.error || 'Failed');
    else { alert('Shared to feed'); setActionMessage(null); }
  };

  const submitReport = async (reason: string) => {
    if (!reportMessage) return;
    const { data: res, error } = await supabase.rpc('report_group_message', { p_message_id: reportMessage.id, p_reason: reason });
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
      const { data: res } = await supabase.rpc('search_group_members', { p_group_id: id, p_query: val.slice(atIdx + 1) });
      setMentionResults(res?.members || []);
    } else setShowMentions(false);
  };

  const pickMention = (m: any) => {
    const atIdx = input.lastIndexOf('@');
    setInput(`${input.slice(0, atIdx)}@${m.username} `);
    setMentions((prev) => [...prev, m]);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!data?.ok) return <div className="p-4 text-center text-xs">Group not found.</div>;

  const g = data.group;
  const isStaff = data.my_role === 'owner' || data.my_role === 'admin';
  const isMuted = data.my_muted_until && new Date(data.my_muted_until) > new Date();
  const canPost = (!g.is_announcement && g.who_can_post === 'everyone') || isStaff;

  return (
    <GroupDetailView
      state={{
        id, data, g, tab, copied, memberAction, showMenu, messages, polls, input,
        me, sending, replyTo, mentions, showMentions, mentionResults, playingId,
        isRecording, actionMessage, showPoll, reportMessage,
      }}
      setters={{
        setTab, setCopied, setMemberAction, setShowMenu, setMessages, setPolls,
        setInput, setMe, setSending, setReplyTo, setMentions, setShowMentions,
        setMentionResults, setPlayingId, setIsRecording, setActionMessage,
        setShowPoll, setReportMessage,
      }}
      actions={{
        loadGroup, loadMessages, copyCode, shareCode, leave, mute, setDisappearing,
        setPostingRule, shareGroupToFeed, sendText, sendImage, startRecording,
        sendRecording, cancelRecording, togglePlay, deleteMsg, shareMessageToFeed,
        submitReport, vote, handleInputChange, pickMention, navigate,
      }}
      refs={{ bottomRef, fileRef, inputRef, audioRef }}
      flags={{ isStaff, isMuted, canPost }}
    />
  );
      }
