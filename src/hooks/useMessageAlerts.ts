import { useCallback, useEffect, useRef, useState } from 'react';
import { d1Request } from '../lib/d1Api';

export interface Toast { cid: string; title: string; text: string }
interface Incoming { id: string; channel_id: string; sender_id: string; body_text: string | null }

const preview = (m: Incoming): string => {
  if (m.body_text?.includes('🎤') || m.body_text?.includes('Voice')) return '🎤 Voice message';
  if (m.body_text?.includes('📷') || m.body_text?.includes('Photo')) return '📷 Photo';
  if (m.body_text?.includes('Shared')) return '↗ Shared a post';
  return m.body_text ?? '';
};

export function useMessageAlerts(me: string | null, activeChannelId: string | null, onOpen: (cid: string) => void) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [unread, setUnread] = useState(0);
  const lastSeen = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!me) return;
    try {
      const result = await d1Request<{ data: { unread_count?: number; messages?: any[] } }>(
        `/api/chat/alerts${lastSeen.current ? `?after=${encodeURIComponent(lastSeen.current)}` : ''}`
      );
      const data = result.data || {};
      setUnread(data.unread_count || 0);
      const incoming = data.messages || [];
      if (incoming.length) {
        const newest = incoming[incoming.length - 1];
        lastSeen.current = newest.created_at || lastSeen.current;
        const message = incoming.find((m: any) => m.sender_id !== me && !(m.thread_id === activeChannelId && document.visibilityState === 'visible'));
        if (message) {
          const name = message.sender_username ? '@' + message.sender_username : '@' + String(message.sender_id || '').slice(0, 6);
          const body = preview({ id: message.id, channel_id: message.thread_id, sender_id: message.sender_id, body_text: message.message_text || null });
          setToast({ cid: message.thread_id, title: name, text: body });
          navigator.vibrate?.(60);
          if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(name, { body, tag: message.thread_id, icon: '/icon-192.png' });
            notification.onclick = () => { window.focus(); onOpen(message.thread_id); notification.close(); };
          }
        }
      }
    } catch { /* Keep existing badge and toast while D1 retries. */ }
  }, [me, activeChannelId, onOpen]);

  useEffect(() => {
    if (!me) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [me, refresh]);

  // Update tab title and app icon badge
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) CenPaya` : "CenPaya";
    const nav = navigator as any;
    void (unread > 0 ? nav.setAppBadge?.(unread) : nav.clearAppBadge?.());
  }, [unread]);

  return { toast, dismiss: () => setToast(null), unread };
}