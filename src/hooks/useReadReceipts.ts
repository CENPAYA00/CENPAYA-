/* src/hooks/useReadReceipts.ts */
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useReadReceipts(
  channelId: string | undefined,
  myUserId: string | null,
): void {
  useEffect(() => {
    if (!channelId || !myUserId) return;

    const mark = async (): Promise<void> => {
      if (document.hidden) return;
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
      } catch (e: unknown) {
        console.warn('read receipt failed', e);
      }
    };

    mark();
    const iv = setInterval(mark, 30000);
    const onVis = (): void => {
      if (!document.hidden) mark();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [channelId, myUserId]);
}
