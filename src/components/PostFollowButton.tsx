import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

type Props = {
  authorId: string;
  initialFollowing: boolean;
  onChanged?: (nowFollowing: boolean) => void;
};

export default function PostFollowButton({ authorId, initialFollowing, onChanged }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getCachedUser();
      setMe(u);
      setChecked(true);
    })();
  }, []);

  if (!checked) return null;
  if (!me) return null;
  if (me.id === authorId) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    if (next) {
      const { error } = await supabase.from('user_follows').insert({ follower_id: me.id, followed_id: authorId });
      if (error) setFollowing(!next);
      else onChanged?.(true);
    } else {
      const { error } = await supabase.from('user_follows').delete().eq('follower_id', me.id).eq('followed_id', authorId);
      if (error) setFollowing(!next);
      else onChanged?.(false);
    }
    setBusy(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
        following
          ? 'bg-gray-100 dark:bg-darkline text-navy dark:text-white'
          : 'bg-accent/10 text-accent'
      } disabled:opacity-50`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
    }
