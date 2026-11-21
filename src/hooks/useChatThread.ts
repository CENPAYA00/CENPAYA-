/* src/hooks/useChatThread.ts */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { d1Request, getD1ApiUrl } from '../lib/d1Api';
import { getCachedUser } from '../lib/cache';
import { useVoiceRecorder } from './useVoiceRecorder';
import { useReadReceipts } from './useReadReceipts';
import { useDemoAutoReply } from './useDemoAutoReply';
import { useSound } from '../contexts/sound';

const PAGE_SIZE = 30;

export type ChatMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  body: string | null;
  message_type: string | null;
  voice_note_url?: string | null;
  media_url?: string | null;
  media_duration_seconds?: number | null;
  voice_duration_seconds?: number | null;
  delivered_at?: string | null;
  read_at?: string | null;
  is_forwarded?: boolean;
  shared_post_id?: string | null;
  created_at: string;
  status?: 'sending' | 'sent' | 'failed';
  error?: string;
  temp?: boolean;
};

export type OtherUser = { id: string; username: string };
export type ForwardTarget = { channel_id: string; username: string };

async function uploadChatMedia(blob: Blob, folder: string, ext: string): Promise<string> {
  const form = new FormData();
  form.append('file', blob, `${crypto.randomUUID()}.${ext}`);
  form.append('folder', folder);
  const response = await fetch(getD1ApiUrl('/api/chat/media'), {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.url) throw new Error(result.error || 'Media upload failed');
  return result.url as string;
}

function normalizeMessage(message: any): ChatMessage {
  return {
    ...message,
    body: message.message_text ?? message.body ?? '',
    message_type: message.message_type || 'text',
    status: message.status || 'sent',
  };
}

export function useChatThread(id: string | undefined) {
  const navigate = useNavigate();
  const { play } = useSound();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [showChatMenu, setShowChatMenu] = useState<boolean>(false);
  const [showForward, setShowForward] = useState<ChatMessage | null>(null);
  const [showReport, setShowReport] = useState<boolean>(false);
  const [showThemePicker, setShowThemePicker] = useState<boolean>(false);
  const [forwardTargets, setForwardTargets] = useState<ForwardTarget[]>([]);
  const [disappearing, setDisappearing] = useState<number | null>(null);
  const [themeKey, setThemeKey] = useState<string>('emerald');
  const [voiceCallsEnabled, setVoiceCallsEnabled] = useState<boolean>(false);
  const [hasOlder, setHasOlder] = useState<boolean>(false);
  const [loadingOlder, setLoadingOlder] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordStartRef = useRef<number>(0);
  const recorder = useVoiceRecorder();

  useReadReceipts(id, userId);
  useDemoAutoReply({ channelId: id, otherUsername: otherUser?.username, messages, myUserId: userId });

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const me = await getCachedUser();
        if (!active) return;
        if (!me || !id) { setLoading(false); return; }
        setUserId(me.id);

        const [peerResult, messagesResult, settingsResult, featureResult] = await Promise.all([
          d1Request<{ data: OtherUser }>(`/api/chat/threads/${encodeURIComponent(id)}/peer`),
          d1Request<{ data: any[] }>(`/api/chat/threads/${encodeURIComponent(id)}/messages?limit=${PAGE_SIZE}`),
          d1Request<{ data: any }>(`/api/chat/threads/${encodeURIComponent(id)}/settings`).catch(() => ({ data: null })),
          d1Request<{ data: any }>('/api/config/features').catch(() => ({ data: null })),
        ]);
        if (!active) return;

        setOtherUser(peerResult.data || null);
        const initial = (messagesResult.data || []).map(normalizeMessage);
        setMessages(initial);
        setHasOlder(initial.length === PAGE_SIZE);
        setDisappearing(settingsResult.data?.disappearing_seconds ?? null);
        setThemeKey(settingsResult.data?.chat_theme || 'emerald');
        setVoiceCallsEnabled(!!featureResult.data?.voice_calls_enabled);
        setLoading(false);
        await d1Request(`/api/chat/threads/${encodeURIComponent(id)}/read`, { method: 'POST' }).catch(() => {});
      } catch (error) {
        console.warn('Could not load chat thread', error);
        if (active) setLoading(false);
      }
    };

    void load();
    const poll = window.setInterval(async () => {
      if (!active || !id) return;
      try {
        const result = await d1Request<{ data: any[] }>(`/api/chat/threads/${encodeURIComponent(id)}/messages?limit=100`);
        if (!active) return;
        const incoming = (result.data || []).map(normalizeMessage);
        setMessages(prev => {
          const known = new Set(prev.map(m => m.id));
          const additions = incoming.filter(m => !known.has(m.id));
          if (additions.some(m => m.sender_id !== userId)) play('message_received');
          return additions.length ? [...prev, ...additions] : prev;
        });
      } catch { /* Keep the conversation visible while the API retries. */ }
    }, 5000);

    return () => { active = false; window.clearInterval(poll); };
  }, [id, play, userId]);

  const loadOlder = useCallback(async (): Promise<void> => {
    if (!id || !messages.length || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0].created_at;
      const result = await d1Request<{ data: any[] }>(
        `/api/chat/threads/${encodeURIComponent(id)}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldest)}`
      );
      const older = (result.data || []).map(normalizeMessage);
      setMessages(prev => [...older.filter(m => !prev.some(p => p.id === m.id)), ...prev]);
      setHasOlder(older.length === PAGE_SIZE);
    } catch (error) {
      console.warn('Could not load older messages', error);
    } finally { setLoadingOlder(false); }
  }, [id, messages, loadingOlder, hasOlder]);

  const handleSend = useCallback(async (): Promise<void> => {
    if (!input.trim() || !userId || !id) return;
    const body = input.trim();
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId, channel_id: id, sender_id: userId, body,
      message_type: 'text', created_at: new Date().toISOString(), status: 'sending',
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    play('message_sent');
    try {
      const result = await d1Request<{ id: string }>(`/api/chat/threads/${encodeURIComponent(id)}/messages`, {
        method: 'POST', body: JSON.stringify({ message_text: body }),
      });
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: result.id, status: 'sent' } : m));
    } catch (error: any) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed', error: error.message } : m));
    }
  }, [input, userId, id, play]);

  const startRecording = useCallback(async (): Promise<void> => {
    const ok = await recorder.start();
    if (ok) { setIsRecording(true); recordStartRef.current = Date.now(); }
  }, [recorder]);

  const sendRecording = useCallback(async (): Promise<void> => {
    const blob = await recorder.stop();
    setIsRecording(false);
    const duration = Math.round((Date.now() - recordStartRef.current) / 1000);
    if (!blob || !userId || !id || duration < 1) return;

    const localUrl = URL.createObjectURL(blob);
    const tempId = `temp-voice-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, channel_id: id, sender_id: userId, body: '🎤 Voice note',
      message_type: 'voice_note', voice_note_url: localUrl, media_url: localUrl,
      media_duration_seconds: duration, created_at: new Date().toISOString(), status: 'sending',
    }]);

    try {
      const ext = (blob.type || '').includes('mp4') ? 'm4a' : (blob.type || '').includes('ogg') ? 'ogg' : 'webm';
      const url = await uploadChatMedia(blob, `chat/${id}/voice`, ext);
      const result = await d1Request<{ id: string }>(`/api/chat/threads/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message_text: '', media_url: url, media_duration_seconds: duration, message_type: 'voice_note' }),
      });
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: result.id, voice_note_url: url, media_url: url, status: 'sent' } : m));
    } catch (error: any) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed', error: error.message } : m));
    }
  }, [recorder, userId, id]);

  const cancelRecording = useCallback((): void => { recorder.cancel(); setIsRecording(false); }, [recorder]);

  const togglePlay = useCallback((m: ChatMessage): void => {
    if (playingId === m.id) { audioRef.current?.pause(); setPlayingId(null); return; }
    if (audioRef.current) audioRef.current.pause();
    const src = m.media_url || m.voice_note_url;
    if (!src) return;
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    void audio.play();
    setPlayingId(m.id);
  }, [playingId]);

  const applyTheme = useCallback(async (key: string): Promise<void> => {
    setThemeKey(key);
    if (!id) return;
    await d1Request(`/api/chat/threads/${encodeURIComponent(id)}/settings`, {
      method: 'PATCH', body: JSON.stringify({ chat_theme: key }),
    });
  }, [id]);

  const setDisappearingSeconds = useCallback(async (seconds: number | null): Promise<void> => {
    if (!id) return;
    try {
      await d1Request(`/api/chat/threads/${encodeURIComponent(id)}/settings`, {
        method: 'PATCH', body: JSON.stringify({ disappearing_seconds: seconds }),
      });
      setDisappearing(seconds);
      setShowChatMenu(false);
    } catch (error: any) { alert(error.message); }
  }, [id]);

  const deleteMsg = useCallback(async (): Promise<void> => {
    if (!actionMessage || !id || !window.confirm('Delete this message?')) return;
    try {
      await d1Request(`/api/chat/threads/${encodeURIComponent(id)}/messages/${encodeURIComponent(actionMessage.id)}`, { method: 'DELETE' });
      setMessages(prev => prev.filter(message => message.id !== actionMessage.id));
      setActionMessage(null);
    } catch (error: any) { alert(error.message || 'Could not delete message'); }
  }, [actionMessage, id]);

  const openForward = useCallback(async (): Promise<void> => {
    if (!actionMessage || !id) return;
    try {
      const result = await d1Request<{ data: ForwardTarget[] }>(`/api/chat/threads/${encodeURIComponent(id)}/forward-targets`);
      setForwardTargets(result.data || []);
      setShowForward(actionMessage);
      setActionMessage(null);
    } catch (error: any) { alert(error.message || 'Could not load conversations'); }
  }, [actionMessage, id]);

  const doForward = useCallback(async (channelId: string): Promise<void> => {
    if (!showForward) return;
    try {
      await d1Request(`/api/chat/messages/${encodeURIComponent(showForward.id)}/forward`, {
        method: 'POST', body: JSON.stringify({ thread_id: channelId }),
      });
      setShowForward(null);
      alert('Forwarded');
    } catch (error: any) { alert(error.message || 'Forward failed'); }
  }, [showForward]);

  const deleteConversation = useCallback(async (): Promise<void> => {
    if (!id || !window.confirm('Delete this conversation for you? The other person keeps their copy.')) return;
    try {
      await d1Request(`/api/chat/threads/${encodeURIComponent(id)}`, { method: 'DELETE' });
      navigate('/chat');
    } catch (error: any) { alert(error.message || 'Could not delete conversation'); }
  }, [id, navigate]);

  const blockUser = useCallback(async (): Promise<void> => {
    if (!otherUser?.id || !window.confirm(`Block @${otherUser.username}?`)) return;
    try {
      await d1Request('/api/me/blocked-users', {
        method: 'POST', body: JSON.stringify({ user_id: otherUser.id }),
      });
      alert(`@${otherUser.username} blocked`);
      setShowChatMenu(false);
    } catch (error: any) { alert(error.message || 'Could not block user'); }
  }, [otherUser]);

  return {
    messages, otherUser, userId, input, setInput, loading, playingId, isRecording,
    actionMessage, setActionMessage, showChatMenu, setShowChatMenu, showForward,
    setShowForward, showReport, setShowReport, showThemePicker, setShowThemePicker,
    forwardTargets, disappearing, themeKey, voiceCallsEnabled, hasOlder, loadingOlder,
    loadOlder, handleSend, startRecording, sendRecording, cancelRecording, togglePlay,
    applyTheme, setDisappearingSeconds, deleteMsg, openForward, doForward,
    deleteConversation, blockUser,
  };
}
