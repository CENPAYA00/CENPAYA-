import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { d1Request, getD1ApiUrl, getD1Token } from '../lib/d1Api';
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
    try { const result = await d1Request<{ data: any }>(`/api/groups/${encodeURIComponent(id)}`); setData(result.data); } catch (error: any) { alert(error.message || 'Could not load group'); }
    setLoading(false);
  };

  const loadMessages = async () => {
    if (!id) return;
    try { const result = await d1Request<{ data: any[] }>(`/api/groups/${encodeURIComponent(id)}/messages?limit=100`); setMessages(result.data || []); } catch (error: any) { console.warn('Could not refresh group messages', error); }
  };

  const loadPoll = async (messageId: string) => {
    try { const result = await d1Request<{ data: any }>(`/api/groups/messages/${encodeURIComponent(messageId)}/poll`); setPolls((prev) => ({ ...prev, [messageId]: result.data })); } catch (error) { console.warn('Could not load group poll', error); }
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
    const timer = window.setInterval(() => { void loadMessages(); }, 5000);
    return () => window.clearInterval(timer);
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
    try { await d1Request(`/api/groups/${encodeURIComponent(id || '')}/leave`, { method: 'POST' }); navigate('/groups'); } catch (error: any) { alert(error.message || 'Failed'); }
  };

  const mute = async (minutes: number | null) => {
    try { await d1Request(`/api/groups/${encodeURIComponent(id || '')}/settings`, { method: 'PATCH', body: JSON.stringify({ mute_minutes: minutes }) }); setShowMenu(false); loadGroup(); } catch (error: any) { alert(error.message || 'Failed'); }
  };

  const setDisappearing = async (seconds: number | null) => {
    try { await d1Request(`/api/groups/${encodeURIComponent(id || '')}/settings`, { method: 'PATCH', body: JSON.stringify({ disappearing_seconds: seconds }) }); setShowMenu(false); loadGroup(); loadMessages(); } catch (error: any) { alert(error.message || 'Failed'); }
  };

  const setPostingRule = async (who: 'everyone' | 'admins') => {
    try { await d1Request(`/api/groups/${encodeURIComponent(id || '')}/settings`, { method: 'PATCH', body: JSON.stringify({ who_can_post: who }) }); setShowMenu(false); loadGroup(); } catch (error: any) { alert(error.message || 'Failed'); }
  };

  const shareGroupToFeed = async () => {
    try { await d1Request(`/api/groups/${encodeURIComponent(id || '')}/share`, { method: 'POST' }); alert('Group shared to feed'); setShowMenu(false); } catch (error: any) { alert(error.message || 'Failed'); }
  };

  const sendText = async () => {
    if (!input.trim() || !id) return;
    const body = input.trim();
    const mentionIds = mentions.map((m) => m.user_id);
    setInput(''); setReplyTo(null); setMentions([]); setSending(true);
    try { await d1Request(`/api/groups/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ message_text: body, message_type: 'text', reply_to_id: replyTo?.id || null, mentions: mentionIds }) }); }
    catch (error: any) { alert(error.message || 'Could not send message'); }
    setSending(false);
  };

  const sendImage = async (file: File) => {
    if (!id) return;
    try {
      const compressed = await compressImage(file);
      const form = new FormData(); form.append('file', compressed, compressed.name || 'image.jpg'); form.append('group_id', id);
      const token = getD1Token();
      const response = await fetch(getD1ApiUrl('/api/groups/media'), { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const uploaded = await response.json().catch(() => ({}));
      if (!response.ok || !uploaded.url) throw new Error(uploaded.error || 'Upload failed');
      await d1Request(`/api/groups/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ message_type: 'image', media_url: uploaded.url, reply_to_id: replyTo?.id || null }) });
      await loadMessages();
    } catch (error: any) { alert(error.message || 'Could not send image'); }
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
    try {
      const form = new FormData(); form.append('file', blob, 'voice.webm'); form.append('group_id', id);
      const token = getD1Token();
      const response = await fetch(getD1ApiUrl('/api/groups/media'), { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const uploaded = await response.json().catch(() => ({}));
      if (!response.ok || !uploaded.url) throw new Error(uploaded.error || 'Upload failed');
      await d1Request(`/api/groups/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ message_type: 'voice_note', media_url: uploaded.url, media_duration_seconds: duration }) });
      await loadMessages();
    } catch (error: any) { alert(error.message || 'Could not send voice note'); }
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
    try { await d1Request(`/api/groups/messages/${encodeURIComponent(actionMessage.id)}`, { method: 'DELETE' }); setMessages((prev) => prev.map((x) => (x.id === actionMessage.id ? { ...x, is_deleted: true, body: null, media_url: null } : x))); } catch (error: any) { alert(error.message || 'Could not delete message'); }
    setActionMessage(null);
  };

  const shareMessageToFeed = async () => {
    if (!actionMessage) return;
    try { await d1Request(`/api/groups/messages/${encodeURIComponent(actionMessage.id)}/share`, { method: 'POST', body: JSON.stringify({ caption: '' }) }); alert('Shared to feed'); setActionMessage(null); } catch (error: any) { alert(error.message || 'Failed'); }
  };

  const submitReport = async (reason: string) => {
    if (!reportMessage) return;
    try { await d1Request(`/api/groups/messages/${encodeURIComponent(reportMessage.id)}/report`, { method: 'POST', body: JSON.stringify({ reason }) }); alert('Reported. Support will review.'); } catch (error: any) { alert(error.message || 'Failed'); }
    setReportMessage(null);
  };

  const vote = async (pollId: string, messageId: string, key: string) => {
    try { await d1Request(`/api/groups/polls/${encodeURIComponent(pollId)}/vote`, { method: 'POST', body: JSON.stringify({ option_key: key }) }); await loadPoll(messageId); } catch (error: any) { alert(error.message || 'Could not vote'); }
  };

  const handleInputChange = async (val: string) => {
    setInput(val);
    const atIdx = val.lastIndexOf('@');
    if (atIdx >= 0 && !val.slice(atIdx + 1).includes(' ')) {
      setShowMentions(true);
      try { const res = await d1Request<{ data: any[] }>(`/api/groups/${encodeURIComponent(id || '')}/members/search?q=${encodeURIComponent(val.slice(atIdx + 1))}`); setMentionResults(res.data || []); } catch { setMentionResults([]); }
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
