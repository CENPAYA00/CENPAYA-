/* src/hooks/useReadReceipts.ts */
import { useEffect } from 'react';
import { d1Request } from '../lib/d1Api';

export function useReadReceipts(
  channelId: string | undefined,
  myUserId: string | null,
): void {
  useEffect(() => {
    if (!channelId || !myUserId) return;

    const mark = async (): Promise<void> => {
      if (document.hidden) return;
      try {
        await d1Request(`/api/chat/threads/${encodeURIComponent(channelId)}/read`, {
          method: 'POST',
        });
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
