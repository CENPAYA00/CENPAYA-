import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MoreVertical, Palette, ChevronDown } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { d1Request, getD1ApiUrl, getD1Token } from '../lib/d1Api';
import { useSound } from '../contexts/sound';
import ReadReceipt from '../components/ReadReceipt';
import ChatMenus from '../components/ChatMenus';
import { VoiceBubble, SharedPostCard, ChatVideoBubble } from '../components/ChatMedia';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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

  const handleSendFiles = async (files: FileList | null) => {
    if(!files||!userId||!id)return;
    for(const file of Array.from(files).slice(0,5)){
      if(file.size<1||file.size>100*1024*1024){alert("Each chat file must be between 1 byte and 100 MB.");continue;}
      const tempId=`temp-file-${crypto.randomUUID()}`;
      setMessages(prev=>[...prev,{id:tempId,thread_id:id,sender_id:userId,body:file.name,message_type:"file",attachments:[{name:file.name,mime_type:file.type,size:file.size}],created_at:new Date().toISOString(),status:"sending"}]);
      setIsAway(false);
      try{
        const url=await upload(file,`chat/${id}/files`,file.name.split(".").pop()||"bin");
        const result=await d1Request<{id:string}>(`/api/chat/threads/${encodeURIComponent(id)}/messages`,{method:"POST",body:JSON.stringify({message_text:"",message_type:"file",attachment_url:url,attachment_name:file.name})});
        setMessages(prev=>prev.map(m=>m.id===tempId?{id:result.id,thread_id:id,sender_id:userId,body:file.name,message_type:"file",attachments:[{name:file.name,mime_type:file.type,size:file.size,url}],created_at:new Date().toISOString(),status:"sent"}:m));
      }catch(error:any){setMessages(prev=>prev.map(m=>m.id===tempId?{...m,status:"failed",error:error?.message||"Upload failed"}:m));}
    }
    if(fileInputRef.current)fileInputRef.current.value="";
  };

  const handleSendVideo = async (file: File | null) => {
    if (!file || !userId || !id) return;
    if (!file.type.startsWith('video/') || file.size < 1 || file.size > 500 * 1024 * 1024) {
      alert('Choose a supported video up to 500 MB.');
      return;
    }
    const tempId = `temp-video-${crypto.randomUUID()}`;
    setMessages(prev => [...prev, { id: tempId, thread_id: id, sender_id: userId, body: 'Video', message_type: 'video', created_at: new Date().toISOString(), status: 'sending' }]);
    setIsAway(false);
    try {
      const intent = await d1Request<{ data: { video_id: string; upload_url: string; method: string; headers: Record<string, string>; max_duration_seconds: number } }>('/api/video-assets/upload-intent', {
        method: 'POST', body: JSON.stringify({ purpose: 'chat', related_id: id, mime_type: file.type, size_bytes: file.size, filename: file.name }),
      });
      const uploaded = await fetch(intent.data.upload_url, { method: intent.data.method, headers: intent.data.headers, body: file });
      if (!uploaded.ok) throw new Error('Video upload failed. Please try again.');
      await d1Request(`/api/video-assets/${encodeURIComponent(intent.data.video_id)}/complete`, { method: 'POST', body: JSON.stringify({}) });
      let ready = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 3000));
        const status = await d1Request<{ data: { status: string } }>(`/api/video-assets/${encodeURIComponent(intent.data.video_id)}/status`);
        if (status.data.status === 'ready') { ready = true; break; }
        if (status.data.status === 'failed') throw new Error('Video processing failed. Please upload another video.');
      }
      if (!ready) throw new Error('Video is still processing. Please try again shortly.');
      const result = await d1Request<{ id: string }>(`/api/chat/threads/${encodeURIComponent(id)}/messages`, {
        method: 'POST', body: JSON.stringify({ message_text: '', message_type: 'video', video_asset_id: intent.data.video_id }),
      });
      setMessages(prev => prev.map(m => m.id === tempId ? { id: result.id, thread_id: id, sender_id: userId, body: 'Video', message_type: 'video', video_asset_id: intent.data.video_id, media_duration_seconds: 0, created_at: new Date().toISOString(), status: 'sent' } : m));
    } catch (error: any) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed', error: error?.message || 'Video upload failed' } : m));
      alert(error?.message || 'Video upload failed');
    } finally {
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const deleteVideoForMe = async (message: any) => {
    try {
      await d1Request(`/api/chat/threads/${encodeURIComponent(id || '')}/messages/${encodeURIComponent(message.id)}?for=me`, { method: 'DELETE' });
      setMessages(prev => prev.filter(m => m.id !== message.id));
    } catch (error: any) { alert(error.message || 'Could not delete this video for you'); }
  };

  const deleteVideoForEveryone = async (message: any) => {
    if (!window.confirm('Delete this video for everyone in the conversation?')) return;
    try {
      await d1Request(`/api/chat/threads/${encodeURIComponent(id || '')}/messages/${encodeURIComponent(message.id)}?for=everyone`, { method: 'DELETE' });
      setMessages(prev => prev.map(m => m.id === message.id ? { ...m, body: 'Message deleted', message_type: 'text', video_asset_id: null, status: 'deleted' } : m));
    } catch (error: any) { alert(error.message || 'Could not delete this video for everyone'); }
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
    const deleteMode = actionMessage.sender_id === userId ? 'everyone' : 'me';
    await d1Request(`/api/chat/threads/${encodeURIComponent(id || '')}/messages/${encodeURIComponent(actionMessage.id)}?for=${deleteMode}`, { method: 'DELETE' });
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
                    {m.message_type === 'file' ? (
                      <div className="min-w-[210px] max-w-[260px] rounded-xl bg-black/5 dark:bg-white/5 p-3">
                        {(m.attachments||[]).map((file:any,i:number)=><a key={file.id||i} href={file.url||undefined} download={file.name} className="flex items-center gap-2 text-inherit no-underline">
                          <span className="w-9 h-9 rounded-lg bg-brand/15 text-brand flex items-center justify-center text-[10px] font-bold shrink-0">FILE</span>
                          <span className="min-w-0 flex-1"><span className="block text-xs font-semibold truncate">{file.name}</span><span className="block text-[10px] opacity-70">{file.size?(Number(file.size)/1048576).toFixed(2)+" MB":"Attachment"}</span></span>
                          <span className="text-xs underline">Download</span>
                        </a>)}
                        {m.status==="failed"&&<span className="text-[10px] text-red-500">{m.error||"Upload failed"}</span>}
                      </div>
                    ) : m.message_type === 'video' && m.video_asset_id ? (
                      <ChatVideoBubble videoId={m.video_asset_id} duration={m.media_duration_seconds || 0} mine={mine}
                        onDeleteForMe={() => void deleteVideoForMe(m)} onDeleteForEveryone={() => void deleteVideoForEveryone(m)} />
                    ) : m.message_type === 'voice_note' && m.media_url ? (
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

      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 dark:border-darkline bg-white dark:bg-darkcard">
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e=>void handleSendFiles(e.target.files)} />
        <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska" className="hidden" onChange={e=>void handleSendVideo(e.target.files?.[0] || null)} />
        <button type="button" onClick={()=>fileInputRef.current?.click()} className="rounded-full px-3 py-2 text-xs font-semibold text-brand border border-brand/30">Attach file</button>
        <button type="button" onClick={()=>videoInputRef.current?.click()} className="rounded-full px-3 py-2 text-xs font-semibold text-brand border border-brand/30">Send video</button>
        <span className="text-[10px] text-gray-500">Files up to 100 MB · videos up to 5 minutes</span>
      </div>
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
