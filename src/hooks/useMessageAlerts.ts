import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Toast { cid: string; title: string; text: string }
interface Incoming { id: string; channel_id: string; sender_id: string; body_text: string | null }

const usernameCache = new Map<string, string>();
const usernameQueue: string[] = [];
let usernameTimeoutRef: ReturnType<typeof setTimeout> | null = null;

const preview = (m: Incoming): string => {
  if (m.body_text?.includes('🎤') || m.body_text?.includes('Voice')) return '🎤 Voice message';
  if (m.body_text?.includes('📷') || m.body_text?.includes('Photo')) return '📷 Photo';
  if (m.body_text?.includes('Shared')) return '↗ Shared a post';
  return m.body_text ?? '';
};

const fetchUsernamesBatch = async (ids: string[]) => {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return;
  const { data, error } = await supabase.from('users').select('id, username').in('id', uniqueIds);
  if (error) return;
  data?.forEach((u: any) => usernameCache.set(u.id, u.username ?? ''));
  // Process any pending queued IDs
  if (usernameQueue.length > 0) {
    const nextBatch = usernameQueue.splice(0, 5);
    await fetchUsernamesBatch(nextBatch);
    if (usernameQueue.length > 0) {
      usernameTimeoutRef && clearTimeout(usernameTimeoutRef);
      usernameTimeoutRef = setTimeout(() => { fetchUsernamesBatch(usernameQueue); }, 1000);
    }
  }
};

export function useMessageAlerts(me: string | null, activeChannelId: string | null, onOpen: (cid: string) => void) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [unread, setUnread] = useState(0);
  const names = useRef(new Map<string, string>());

  const refreshUnread = useCallback(async () => {
    if (!me) return;
    const { count } = await supabase
      .from('chat_messages_stream')
      .select('id', { count: 'exact', head: true })
      .neq('sender_id', me);
    setUnread(count ?? 0);
  }, [me]);

  useEffect(() => {
    if (!me) return;
    void refreshUnread();

    const ch = supabase.channel(`alerts:${me}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages_stream' }, () => void refreshUnread())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages_stream' }, async (p) => {
        const m = p.new as Incoming;
        if (m.sender_id === me) return;

        setUnread((n) => n + 1);

        if (m.channel_id === activeChannelId && document.visibilityState === 'visible') return;

        // Batch fetch username if not in cache
        let name = names.current.get(m.sender_id);
        if (!name) {
          if (!usernameCache.has(m.sender_id)) {
            usernameQueue.push(m.sender_id);
            if (!usernameTimeoutRef) {
              usernameTimeoutRef = setTimeout(() => { fetchUsernamesBatch(usernameQueue); }, 100);
            }
          }
          name = names.current.get(m.sender_id) || '@' + m.sender_id.substring(0, 6);
        }

        setToast({ cid: m.channel_id, title: name, text: preview(m) });
        navigator.vibrate?.(60);

        if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
          const n = new Notification(name, { body: preview(m), tag: m.channel_id, icon: "/icon-192.png" });
          n.onclick = () => { window.focus(); onOpen(m.channel_id); n.close(); };
        }
      }).subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [me, activeChannelId, onOpen, refreshUnread]);

  useEffect(() => {
    usernameTimeoutRef && clearTimeout(usernameTimeoutRef);
    usernameTimeoutRef = setTimeout(() => { fetchUsernamesBatch(usernameQueue); }, 2000);
  }, [usernameQueue.length]);

  // Update tab title and app icon badge
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) CenPaya` : "CenPaya";
    const nav = navigator as any;
    void (unread > 0 ? nav.setAppBadge?.(unread) : nav.clearAppBadge?.());
  }, [unread]);

  return { toast, dismiss: () => setToast(null), unread };
}