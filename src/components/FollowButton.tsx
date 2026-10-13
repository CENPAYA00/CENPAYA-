import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

type Props = {
  targetId: string;
  initialFollowing: boolean;
  onChanged?: (nowFollowing: boolean) => void;
  size?: 'sm' | 'md';
};

export default function FollowButton({
  targetId, initialFollowing, onChanged, size = 'md',
}: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const me = await getCachedUser();
    if (!me) { alert('Please log in'); return; }
    if (me.id === targetId) return;

    setBusy(true);
    const next = !following;
    setFollowing(next);

    if (next) {
      const { error } = await supabase
        .from('user_follows')
        .insert({ follower_id: me.id, followed_id: targetId });
      if (error) {
        setFollowing(!next);
      } else {
        onChanged?.(true);
      }
    } else {
      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', me.id)
        .eq('followed_id', targetId);
      if (error) {
        setFollowing(!next);
      } else {
        onChanged?.(false);
      }
    }
    setBusy(false);
  };

  const classes = size === 'sm'
    ? 'text-[10px] font-bold px-3 py-1.5 rounded-lg'
    : 'text-[11px] font-bold px-4 py-2 rounded-lg';

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`${classes} ${
        following
          ? 'bg-gray-200 dark:bg-darkline text-navy dark:text-white'
          : 'bg-accent text-white'
      } active:scale-[0.98] disabled:opacity-50`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
