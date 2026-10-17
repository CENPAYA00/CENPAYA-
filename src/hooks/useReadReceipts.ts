/* src/hooks/useReadReceipts.js */
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useReadReceipts(channelId, myUserId) {
  useEffect(() => {
    if (!channelId || !myUserId) return;

    const mark = async () => {
      if (document.hidden) return; // CHANGED: don't write when tab hidden
      try {
        await supabase
          .from('chat_messages')
          .update({ read_at: new Date().toISOString() })
          .eq('channel_id', channelId)
          .neq('sender_id', myUserId)
          .is('read_at', null);

        await supabase
          .from('chat_participants')
          .update({ last_read_at: new Date().toISOString() })
          .eq('channel_id', channelId)
          .eq('user_id', myUserId);
      } catch (e) {
        console.warn('read receipt failed', e);
      }
    };

    mark();
    const iv = setInterval(mark, 30000); // CHANGED: 15s → 30s
    const onVis = () => { if (!document.hidden) mark(); };
    document.addEventListener('visibilitychange', onVis); // ADDED
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [channelId, myUserId]);
}
