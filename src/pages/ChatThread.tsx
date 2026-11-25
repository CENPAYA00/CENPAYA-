import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MoreVertical, Palette, ChevronDown } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { d1Request, getD1ApiUrl, getD1Token } from '../lib/d1Api';
import { useSound } from '../contexts/sound';
import ReadReceipt from '../components/ReadReceipt';
import ChatMenus from '../components/ChatMenus';
import { VoiceBubble, SharedPostCard } from '../components/ChatMedia';
import { RichComposer } from '../components/RichComposer';
import { resolveTheme, ChatThemeKey } from '../lib/chatThemes';

async function compressImage(file: File, max = 1280, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("compress failed"))), "image/jpeg", quality));
}

async function upload(blob: Blob, folder: string, ext: string): Promise<string> {
  const form = new FormData();
  form.append('file', blob, `${crypto.randomUUID()}.${ext}`);
  form.append('folder', folder);
  const token = getD1Token();
  const response = await fetch(getD1ApiUrl('/api/chat/media'), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.url) throw new Error(result.error || 'Media upload failed');
  return result.url as string;
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

  // RESTORED MISSING PROPS
  const [showForward, setShowForward] = useState<any>(null);
  const [showReport, setShowReport] = useState(false);
  const [forwardTargets, setForwardTargets] = useState<any[]>([]);
  const [disappearing, setDisappearing] = useState<number | null>(null);
  
  const parentRef = useRef<HTMLDivElement>(null);

  const theme = resolveTheme(themeKey);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!id) { setLoading(false); return; }
        const me = await d1Request<{ user: { id: string } }>('/api/me');
        if (!active) return;
        setUserId(me.user.id);
        const [profileResult, messagesResult] = await Promise.all([
          d1Request<{ data: any }>(`/api/chat/threads/${encodeURIComponent(id)}/peer`),
          d1Request<{ data: any[] }>(`/api/chat/threads/${encodeURIComponent(id)}/messages?limit=100`),
        ]);
        if (!active) return;
        setOtherUser(profileResult.data || null);
        const initialMessages = (messagesResult.data || []).map((m: any) => ({
          ...m, body: m.message_text ?? m.body ?? '', message_type: m.message_type || 'text',
          created_at: m.created_at, status: m.status || 'sent',
        }));
        setMessages(initialMessages);
        setLoading(false);
        await d1Request(`/api/chat/threads/${encodeURIComponent(id)}/read`, { method: 'POST' }).catch(() => {});
      } catch (error: any) {
        if (active) { alert(error.message || 'Could not load conversation'); setLoading(false); }
      }
    };
    void load();
    const poll = window.setInterval(async () => {
      if (!id || !active) return;
      try {
        const result = await d1Request<{ data: any[] }>(`/api/chat/threads/${encodeURIComponent(id)}/messages?limit=100`);
        if (!active) return;
        const incoming = (result.data || []).map((m: any) => ({ ...m, body: m.message_text ?? m.body ?? '', message_type: m.message_type || 'text', status: m.status || 'sent' }));
        setMessages(prev => {
          const known = new Set(prev.map(m => m.id));
          const additions = incoming.filter(m => !known.has(m.id));
          if (additions.some(m => m.sender_id !== userId)) play('message_received');
          return additions.length ? [...prev, ...additions] : prev;
        });
      } catch { /* Keep the current conversation visible while polling retries. */ }
    }, 5000);
    return () => { active = false; window.clearInterval(poll); };
  }, [id, play, userId]);

  const handleSendText = async (text: string) => {
    if (!text.trim() || !userId) return;
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, channel_id: id, sender_id: userId, body: text, message_type: 'text', created_at: new Date().toISOString(), status: 'sending' }]);
    setIsAway(false);
    try {
      const result = await d1Request<{ id: string }>(`/api/chat/threads/${encodeURIComponent(id || '')}/messages`, { method: 'POST', body: JSON.stringify({ message_text: text }) });
      setMessages(prev => prev.map(m => m.id === tempId ? { id: result.id, thread_id: id, sender_id: userId, body: text, message_type: 'text', created_at: new Date().toISOString(), status: 'sent' } : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
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
        const result = await d1Request<{ id: string }>(`/api/chat/threads/${encodeURIComponent(id || '')}/messages`, { method: 'POST', body: JSON.stringify({ message_text: '', media_url: url, message_type: 'image' }) });
        setMessages(prev => prev.map(m => m.id === tempId ? { id: result.id, thread_id: id, sender_id: userId, body: '', message_type: 'image', media_url: url, created_at: new Date().toISOString(), status: 'sent' } : m));
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
      const result = await d1Request<{ id: string }>(`/api/chat/threads/${encodeURIComponent(id || '')}/messages`, { method: 'POST', body: JSON.stringify({ message_text: '', media_url: url, media_duration_seconds: durationMs / 1000, message_type: 'voice_note' }) });
      setMessages(prev => prev.map(m => m.id === tempId ? { id: result.id, thread_id: id, sender_id: userId, body: '', message_type: 'voice_note', media_url: url, media_duration_seconds: durationMs / 1000, created_at: new Date().toISOString(), status: 'sent' } : m));
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

  // RESTORED MISSING MENU FUNCTIONS
  const applyTheme = async (k: ChatThemeKey) => {
    setThemeKey(k);
    if (!id || !userId) return;
    await d1Request(`/api/chat/threads/${encodeURIComponent(id)}/settings`, { method: 'PATCH', body: JSON.stringify({ chat_theme: k }) });
  };

  const setDisappearingSeconds = async (seconds: number | null) => {
    if (!id) return;
    try { await d1Request(`/api/chat/threads/${encodeURIComponent(id)}/settings`, { method: 'PATCH', body: JSON.stringify({ disappearing_seconds: seconds }) }); } catch (error: any) { alert(error.message); return; }
    setDisappearing(seconds);
    setShowChatMenu(false);
  };

  const deleteMsg = async () => {
    if (!actionMessage) return;
    if (!window.confirm('Delete this message?')) return;
    await d1Request(`/api/chat/threads/${encodeURIComponent(id || '')}/messages/${encodeURIComponent(actionMessage.id)}`, { method: 'DELETE' });
    setMessages(prev => prev.filter(x => x.id !== actionMessage.id));
    setActionMessage(null);
  };

  const openForward = async () => {
    if (!actionMessage) return;
    try {
      const result = await d1Request<{ data: any[] }>(`/api/chat/threads/${encodeURIComponent(id || '')}/forward-targets`);
      setForwardTargets(result.data || []);
      setShowForward(actionMessage);
      setActionMessage(null);
    } catch (error: any) { alert(error.message || 'Could not load conversations'); }
  };

  const doForward = async (channelId: string) => {
    if (!showForward) return;
    try { await d1Request('/api/chat/messages/' + encodeURIComponent(showForward.id) + '/forward', { method: 'POST', body: JSON.stringify({ thread_id: channelId }) }); } catch (error: any) { alert(error.message || 'Forward failed'); return; }
    setShowForward(null);
    alert('Forwarded');
  };

  const deleteConversation = async () => {
    if (!id) return;
    if (!window.confirm('Delete this conversation for you? The other person keeps their copy.')) return;
    try { await d1Request(`/api/chat/threads/${encodeURIComponent(id)}/leave`, { method: 'POST' }); } catch (error: any) { alert(error.message); return; }
    navigate('/chat');
  };

  const blockUser = async () => {
    if (!otherUser?.id) return;
    if (!window.confirm(`Block @${otherUser.username}?`)) return;
    try { await d1Request('/api/me/blocked-users', { method: 'POST', body: JSON.stringify({ user_id: otherUser.id }) }); } catch (error: any) { alert(error.message); return; }
    alert(`@${otherUser.username} blocked`);
    setShowChatMenu(false);
  };

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
                      <span data-no-translate>{m.body}</span>
                    )}

                    {mine && (
                      <div className="flex justify-end mt-1">
                        {isFailed ? <span className="text-[9px] text-red-300">Failed</span> : isPending ? <span className="w-2 h-2 rounded-full bg-white/50 animate-pulse" /> : <ReadReceipt delivered={!!m.delivered_at} read={!!m.read_at} />}
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

      <RichComposer onSendText={handleSendText} onPickImages={handleSendImages} onVoice={handleSendVoice} />

      <ChatMenus 
        showChatMenu={showChatMenu} setShowChatMenu={setShowChatMenu} 
        showThemePicker={showThemePicker} setShowThemePicker={setShowThemePicker} 
        actionMessage={actionMessage} setActionMessage={setActionMessage} 
        showForward={showForward} setShowForward={setShowForward}
        showReport={showReport} setShowReport={setShowReport}
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
