import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useReadReceipts(channelId: string | undefined, myUserId: string | null) {
  useEffect(() => {
    if (!channelId || !myUserId) return;

    const mark = async () => {
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
    const iv = setInterval(mark, 15000);
    return () => clearInterval(iv);
  }, [channelId, myUserId]);
  }
