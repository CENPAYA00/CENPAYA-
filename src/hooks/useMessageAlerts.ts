import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Toast { cid: string; title: string; text: string }
interface Incoming { id: string; channel_id: string; sender_id: string; body: string | null; message_type?: string | null }

const preview = (m: Incoming): string => {
  if (m.message_type === 'voice_note') return '🎤 Voice message';
  if (m.message_type === 'image') return '📷 Photo';
  if (m.message_type === 'shared_post') return '↗ Shared a post';
  return m.body ?? '';
};

export function useMessageAlerts(me: string | null, activeChannelId: string | null, onOpen: (cid: string) => void) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [unread, setUnread] = useState(0);
  const names = useRef(new Map<string, string>());

  const refreshUnread = useCallback(async () => {
    if (!me) return;
    const { count } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .neq('sender_id', me);
    setUnread(count ?? 0);
  }, [me]);

  useEffect(() => {
    if (!me) return;
    void refreshUnread();

    const ch = supabase.channel(`alerts:${me}`)
      // 1. Listen for reads to update the badge
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, () => void refreshUnread())
      
      // 2. Listen for new messages
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (p) => {
        const m = p.new as Incoming;
        if (m.sender_id === me) return;
        
        setUnread((n) => n + 1);
        
        // If we are already looking at this chat, don't show the banner
        if (m.channel_id === activeChannelId && document.visibilityState === 'visible') return;

        let name = names.current.get(m.sender_id);
        if (!name) {
          const { data } = await supabase.from('public_profiles').select('username').eq('id', m.sender_id).single();
          name = data?.username ? `@${data.username}` : 'New message'; 
          names.current.set(m.sender_id, name);
        }
        
        setToast({ cid: m.channel_id, title: name, text: preview(m) });
        navigator.vibrate?.(60); // Vibrate phone
        
        if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
          const n = new Notification(name, { body: preview(m), tag: m.channel_id, icon: "/icon-192.png" });
          n.onclick = () => { window.focus(); onOpen(m.channel_id); n.close(); };
        }
      }).subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [me, activeChannelId, onOpen, refreshUnread]);

  // Update tab title and app icon badge
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) CenPaya` : "CenPaya";
    const nav = navigator as any;
    void (unread > 0 ? nav.setAppBadge?.(unread) : nav.clearAppBadge?.());
  }, [unread]);

  return { toast, dismiss: () => setToast(null), unread };
}
