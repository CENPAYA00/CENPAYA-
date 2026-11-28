import { useEffect, useState } from 'react';
import { Check, UserPlus } from 'lucide-react';
import { d1Request } from '../lib/d1Api';

type Props = {
  targetId: string;
  initialFollowing: boolean;
  onChanged?: (nowFollowing: boolean) => void;
  onFollowToggle?: (nowFollowing: boolean) => void;
  size?: 'sm' | 'md';
  variant?: 'default' | 'post';
};

export default function FollowButton({
  targetId, initialFollowing, onChanged, onFollowToggle, size = 'md', variant = 'default',
}: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setFollowing(initialFollowing); }, [initialFollowing, targetId]);

  const toggle = async () => {
    if (busy || !targetId) return;
    setBusy(true);
    setError('');
    const next = !following;
    try {
      await d1Request('/api/profiles/' + encodeURIComponent(targetId) + '/follow', { method: next ? 'POST' : 'DELETE' });
      setFollowing(next);
      onChanged?.(next);
      onFollowToggle?.(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update follow');
    } finally {
      setBusy(false);
    }
  };

  const post = variant === 'post';
  const classes = post
    ? 'text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1'
    : size === 'sm' ? 'text-[10px] font-bold px-3 py-1.5 rounded-lg' : 'text-[11px] font-bold px-4 py-2 rounded-lg';
  const appearance = post
    ? following ? 'text-gray-500 bg-gray-100 dark:bg-darkline' : 'text-accent bg-accent/10'
    : following ? 'bg-gray-200 dark:bg-darkline text-navy dark:text-white' : 'bg-accent text-white';

  return (
    <div className="flex flex-col items-start">
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={following}
        className={`${classes} ${appearance} active:scale-[0.98] disabled:opacity-50`}>
        {post && (following ? <Check size={11} /> : <UserPlus size={11} />)}
        {following ? 'Following' : 'Follow'}
      </button>
      {error && <span role="status" className="mt-1 max-w-40 text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
