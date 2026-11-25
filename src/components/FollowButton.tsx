import { useState } from 'react';
import { d1Request } from '../lib/d1Api';

type Props = { targetId: string; initialFollowing: boolean; onChanged?: (nowFollowing: boolean) => void; size?: 'sm' | 'md' };
export default function FollowButton({ targetId, initialFollowing, onChanged, size = 'md' }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [requestSent, setRequestSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy || !targetId) return;
    setBusy(true);
    const next = requestSent || following ? false : true;
    try {
      const result = await d1Request<{ following?: boolean; request_sent?: boolean }>('/api/profiles/' + encodeURIComponent(targetId) + '/follow', { method: next ? 'POST' : 'DELETE' });
      setRequestSent(!!result.request_sent);
      setFollowing(!!result.following);
      onChanged?.(!!result.following);
    } catch (error: any) { alert(error.message || 'Could not update follow'); }
    finally { setBusy(false); }
  };
  const classes = size === 'sm' ? 'text-[10px] font-bold px-3 py-1.5 rounded-lg' : 'text-[11px] font-bold px-4 py-2 rounded-lg';
  return <button onClick={toggle} disabled={busy} className={`${classes} ${following ? 'bg-gray-200 dark:bg-darkline text-navy dark:text-white' : 'bg-accent text-white'} active:scale-[0.98] disabled:opacity-50`}>{following ? 'Following' : requestSent ? 'Requested' : 'Follow'}</button>;
}
