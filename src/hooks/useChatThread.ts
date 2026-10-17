/* src/hooks/useChatThread.ts */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
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
type ParticipantRow = { disappearing_seconds: number | null; chat_theme: string | null };

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
  useDemoAutoReply({
    channelId: id,
    otherUsername: otherUser?.username,
    messages,
    myUserId: userId,
  });

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let me: { id: string } | null = null;

    const load = async (): Promise<void> => {
      me = await getCachedUser();
      if (!me || !id) {
        setLoading(false);
        return;
      }
      setUserId(me.id);

      const [othersRes, participantRes, msgsRes, settingsRes] = await Promise.all([
        supabase
          .from('chat_participants')
          .select('user_id')
          .eq('channel_id', id)
          .neq('user_id', me.id)
          .maybeSingle<{ user_id: string }>(),
        supabase
          .from('chat_participants')
          .select('disappearing_seconds, chat_theme')
          .eq('channel_id', id)
          .eq('user_id', me.id)
          .maybeSingle<ParticipantRow>(),
        supabase
          .from('chat_messages')
          .select('*')
          .eq('channel_id', id)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE),
        supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'voice_calls_enabled')
          .maybeSingle<{ value: string }>(),
      ]);

      if (othersRes.data?.user_id) {
        const { data: p } = await supabase
          .from('public_profiles')
          .select('id, username')
          .eq('id', othersRes.data.user_id)
          .maybeSingle<OtherUser>();
        setOtherUser(p ?? null);
      }

      setDisappearing(participantRes.data?.disappearing_seconds ?? null);
      if (participantRes.data?.chat_theme) {
        setThemeKey(participantRes.data.chat_theme);
      }

      const initial = ((msgsRes.data ?? []) as ChatMessage[]).slice().reverse();
      setMessages(initial);
      setHasOlder(initial.length === PAGE_SIZE);
      setVoiceCallsEnabled(settingsRes.data?.value === 'true');
      setLoading(false);

      const sub = supabase
        .channel(`chat_${id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `channel_id=eq.${id}`,
          },
          (payload) => {
            const m = payload.new as ChatMessage;
            setMessages((prev) => {
              if (prev.some((x) => x.id === m.id)) return prev;
              const idx = prev.findIndex(
                (x) =>
                  String(x.id).startsWith('temp-') &&
                  x.body === m.body &&
                  x.sender_id === m.sender_id,
              );
              if (idx >= 0) {
                const copy = prev.slice();
                copy[idx] = { ...m, status: 'sent' };
                return copy;
              }
              return [...prev, m];
            });
            if (me && m.sender_id !== me.id) play('message_received');
          },
        )
        .subscribe();

      cleanup = () => {
        supabase.removeChannel(sub);
      };
    };

    load();
    return () => {
      cleanup?.();
    };
  }, [id, play]);

  const loadOlder = useCallback(async (): Promise<void> => {
    if (!id || !messages.length || loadingOlder) return;
    setLoadingOlder(true);
    const oldest = messages[0].created_at;
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', id)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const older = ((data ?? []) as ChatMessage[]).slice().reverse();
    setMessages((prev) => [...older, ...prev]);
    setHasOlder(older.length === PAGE_SIZE);
    setLoadingOlder(false);
  }, [id, messages, loadingOlder]);

  const handleSend = useCallback(async (): Promise<void> => {
    if (!input.trim() || !userId || !id) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      channel_id: id,
      sender_id: userId,
      body: input.trim(),
      message_type: 'text',
      created_at: new Date().toISOString(),
      status: 'sending',
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setInput('');
    play('message_sent');

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        channel_id: id,
        sender_id: userId,
        body: optimisticMsg.body,
        message_type: 'text',
      })
      .select()
      .single<ChatMessage>();

    if (data && !error) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...data, status: 'sent' } : m)),
      );
    } else {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)),
      );
    }
  }, [input, userId, id, play]);

  const startRecording = useCallback(async (): Promise<void> => {
    const ok = await recorder.start();
    if (ok) {
      setIsRecording(true);
      recordStartRef.current = Date.now();
    }
  }, [recorder]);

  const sendRecording = useCallback(async (): Promise<void> => {
    const blob = await recorder.stop();
    setIsRecording(false);
    const duration = Math.round((Date.now() - recordStartRef.current) / 1000);
    if (!blob || !userId || !id || duration < 1) return;

    const localUrl = URL.createObjectURL(blob);
    const tempId = `temp-voice-${Date.now()}`;

    const optimisticMsg: ChatMessage = {
      id: tempId,
      channel_id: id,
      sender_id: userId,
      body: '🎤 Voice note',
      message_type: 'voice_note',
      voice_note_url: localUrl,
      media_url: localUrl,
      media_duration_seconds: duration,
      created_at: new Date().toISOString(),
      status: 'sending',
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const extFromType = (blob.type || '').includes('mp4')
      ? 'm4a'
      : (blob.type || '').includes('ogg')
        ? 'ogg'
        : 'webm';
    const path = `voice-notes/${id}/${Date.now()}.${extFromType}`;

    const { error: upErr } = await supabase.storage
      .from('chat-media')
      .upload(path, blob, { contentType: blob.type || 'audio/webm' });

    if (upErr) {
      console.error('Upload error:', upErr);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, status: 'failed', error: upErr.message } : m,
        ),
      );
      return;
    }

    const { data: urlData } = supabase.storage
      .from('chat-media')
      .getPublicUrl(path);

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        channel_id: id,
        sender_id: userId,
        body: '🎤 Voice note',
        message_type: 'voice_note',
        voice_note_url: urlData.publicUrl,
        media_url: urlData.publicUrl,
        media_duration_seconds: duration,
      })
      .select()
      .single<ChatMessage>();

    if (data && !error) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...data, status: 'sent' } : m)),
      );
    } else {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)),
      );
    }
  }, [recorder, userId, id]);

  const cancelRecording = useCallback((): void => {
    recorder.cancel();
    setIsRecording(false);
  }, [recorder]);

  const togglePlay = useCallback(
    (m: ChatMessage): void => {
      if (playingId === m.id) {
        audioRef.current?.pause();
        setPlayingId(null);
        return;
      }
      if (audioRef.current) audioRef.current.pause();
      const src = m.media_url || m.voice_note_url;
      if (!src) return;
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      audio.play();
      setPlayingId(m.id);
    },
    [playingId],
  );

  const applyTheme = useCallback(
    async (k: string): Promise<void> => {
      setThemeKey(k);
      if (!id || !userId) return;
      await supabase
        .from('chat_participants')
        .update({ chat_theme: k })
        .eq('channel_id', id)
        .eq('user_id', userId);
    },
    [id, userId],
  );

  const setDisappearingSeconds = useCallback(
    async (seconds: number | null): Promise<void> => {
      if (!id) return;
      const { error } = await supabase.rpc('set_chat_disappearing', {
        p_channel_id: id,
        p_seconds: seconds,
      });
      if (error) {
        alert(error.message);
        return;
      }
      setDisappearing(seconds);
      setShowChatMenu(false);
    },
    [id],
  );

  const deleteMsg = useCallback(async (): Promise<void> => {
    if (!actionMessage) return;
    if (!window.confirm('Delete this message?')) return;
    await supabase.from('chat_messages').delete().eq('id', actionMessage.id);
    setMessages((prev) => prev.filter((x) => x.id !== actionMessage.id));
    setActionMessage(null);
  }, [actionMessage]);

  const openForward = useCallback(async (): Promise<void> => {
    if (!actionMessage) return;
    const me = await getCachedUser();
    if (!me) return;
    const { data: myChannels } = await supabase
      .from('chat_participants')
      .select('channel_id')
      .eq('user_id', me.id);
    if (!myChannels || myChannels.length === 0) {
      setShowForward(actionMessage);
      setActionMessage(null);
      return;
    }
    const ids = (myChannels as { channel_id: string }[]).map((c) => c.channel_id);
    const { data: others } = await supabase
      .from('chat_participants')
      .select('channel_id, user_id')
      .in('channel_id', ids)
      .neq('user_id', me.id);
    const otherIds = [
      ...new Set(((others ?? []) as { user_id: string }[]).map((o) => o.user_id)),
    ];
    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, username')
      .in('id', otherIds);
    const map: Record<string, string> = {};
    ((profiles ?? []) as OtherUser[]).forEach((p) => {
      map[p.id] = p.username;
    });
    setForwardTargets(
      ((others ?? []) as { channel_id: string; user_id: string }[]).map((o) => ({
        channel_id: o.channel_id,
        username: map[o.user_id] || 'User',
      })),
    );
    setShowForward(actionMessage);
    setActionMessage(null);
  }, [actionMessage]);

  const doForward = useCallback(
    async (channelId: string): Promise<void> => {
      if (!showForward) return;
      const { data, error } = await supabase.rpc('forward_message', {
        p_message_id: showForward.id,
        p_target_channel_id: channelId,
      });
      if (error || !data?.ok) {
        alert(error?.message || data?.error || 'Forward failed');
        return;
      }
      setShowForward(null);
      alert('Forwarded');
    },
    [showForward],
  );

  const deleteConversation = useCallback(async (): Promise<void> => {
    if (!id) return;
    if (
      !window.confirm(
        'Delete this conversation for you? The other person keeps their copy.',
      )
    ) {
      return;
    }
    const { error } = await supabase.rpc('delete_my_chat', { p_channel_id: id });
    if (error) {
      alert(error.message);
      return;
    }
    navigate('/chat');
  }, [id, navigate]);

  const blockUser = useCallback(async (): Promise<void> => {
    if (!otherUser?.id) return;
    if (!window.confirm(`Block @${otherUser.username}?`)) return;
    const { error } = await supabase.rpc('toggle_block', {
      p_target_id: otherUser.id,
    });
    if (error) {
      alert(error.message);
      return;
    }
    alert(`@${otherUser.username} blocked`);
    setShowChatMenu(false);
  }, [otherUser]);

  return {
    // state
    messages,
    otherUser,
    userId,
    input,
    setInput,
    loading,
    playingId,
    isRecording,
    actionMessage,
    setActionMessage,
    showChatMenu,
    setShowChatMenu,
    showForward,
    setShowForward,
    showReport,
    setShowReport,
    showThemePicker,
    setShowThemePicker,
    forwardTargets,
    disappearing,
    themeKey,
    voiceCallsEnabled,
    hasOlder,
    loadingOlder,
    // actions
    loadOlder,
    handleSend,
    startRecording,
    sendRecording,
    cancelRecording,
    togglePlay,
    applyTheme,
    setDisappearingSeconds,
    deleteMsg,
    openForward,
    doForward,
    deleteConversation,
    blockUser,
  };
    }
